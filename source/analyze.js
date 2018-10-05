// Import external module
const
  async = require('async');

const request = require('request');

const Twitter = require('twitter');

// Import our module
const userIndex = require('./index/user');

const friendsIndex = require('./index/friends');

const temporalIndex = require('./index/temporal');

const networkIndex = require('./index/network');

module.exports = function (screen_name, config, index = {user: true, friend: true, network: true, temporal: true}, cb) {
  return new Promise(async (resolve, reject) => {
    if (!screen_name || !config) {
      let error = 'You need to provide an username to analyze and a config for twitter app';
      if (cb) cb(error, null);
      reject(error);
      return error;
    }
    if (!config.consumer_key || !config.consumer_secret) {
      let error = '.twitter.json config file should have the following parameters:\nconsumer_key\nconsumer_secret';
      if (cb) cb(error, null);
      reject(error);
      return error;
    }
    if (!config.access_token_key || !config.access_token_secret) {
      config.bearer_token = await requestBearer(config);
    }
    // Create Twitter client
    const client = new Twitter(config);
    let param = {
      screen_name: screen_name,
    };
    let indexCount = 0;
    async.parallel([
      function (callback) {
        if (index.user === false) {
          callback();
          return;
        }
        client.get('users/show', param, async function (error, tweets, response_twitter_user) {
          if (error) {
            callback(error);
            return;
          }
          let data = JSON.parse(response_twitter_user.body);
          let res = await userIndex(data);
          indexCount++;
          callback(null, res, data);
        });
      },
      function (callback) {
        if (index.friend === false) {
          callback();
          return;
        }
        param.count = 200;
        client.get('followers/list', param, async function (error, tweets, response_twitter_user) {
          if (error) {
            callback(error);
            return;
          }
          let data = JSON.parse(response_twitter_user.body);
          let res = await friendsIndex(data);
          indexCount++;
          callback(null, res);
        });
      },
      function (callback) {
        if (index.friend === false) {
          callback();
          return;
        }
        param.count = 200;
        client.get('friends/list', param, async function (error, tweets, response_twitter_user) {
          if (error) {
            callback(error);
            return;
          }
          let data = JSON.parse(response_twitter_user.body);
          let res = await friendsIndex(data);
          callback(null, res);
        });
      },
      function (callback) {
        if (index.temporal === false && index.netowrk === false) {
          callback();
          return;
        }
        param.count = 200;
        client.get('statuses/user_timeline', param, async function (error, tweets, response_twitter_user) {
          if (error) {
            callback(error);
            return;
          }
          let data = JSON.parse(response_twitter_user.body);
          let res1 = null;
          let res2 = null;
          if (index.temporal !== false) {
            res1 = await temporalIndex(data);
            indexCount++;
          }
          if (index.netowrk !== false) {
            res2 = await networkIndex(data);
            indexCount++;
          }
          callback(null, [res1, res2]);
        });
      },
    ], function (err, results) {
      if (err) {
        if (cb) cb(err, null);
        reject(err);
        return err;
      }
      let user = results[0][1];
      let userScore = results[0][0];
      let friendsScore = (results[1] + (results[2] * 1.5)) / (2 * 1.5);
      let temporalScore = results[3][0];
      let networkScore = results[3][1];
      if (isNaN(userScore)) userScore = null;
      if (isNaN(friendsScore)) friendsScore = null;
      if (isNaN(temporalScore)) temporalScore = null;
      if (isNaN(networkScore)) networkScore = null;
      if (userScore === 0) {
        indexCount += 2;
      }
      if (networkScore === 0) {
        indexCount += 1;
      }
      if (temporalScore === 0) {
        indexCount += 1;
      }
      let scoreSum = userScore + friendsScore + temporalScore + networkScore
      let total = scoreSum / indexCount;
      if (total > 1) {
        total = 1;
      }
      if (networkScore > 1) {
        networkScore /= 2;
      }
      else if (networkScore > 2) {
        networkScore = 1
      }
      if (temporalScore > 1) {
        temporalScore /= 2;
      }
      else if (temporalScore > 2) {
        temporalScore = 1
      }
      let object = {
        metadata: {
          count: 1,
        },
        profiles: new Array({
          username: param.screen_name,
          url: 'https://twitter.com/' + param.screen_name,
          avatar: user.profile_image_url,
          language_independent: {
            friend: friendsScore,
            temporal: temporalScore,
            network: networkScore,
            user: userScore,
          },
          bot_probability: {
            all: total,
          },
          user_profile_language: user.lang,
        }),
      };
      if (cb) cb(null, object);
      resolve(object);
      return object;
    });
  });
};

function requestBearer(config) {
  return new Promise((resolve, reject) => {
    let body = {
      grant_type: 'client_credentials',
    };
    let param = {
      method: 'POST',
      url: 'https://api.twitter.com/oauth2/token',
      headers: {
        Authorization: 'Basic ' + Buffer.from(config.consumer_key + ':' + config.consumer_secret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': 29,
      },
      body: require('querystring').stringify(body),
    };
    request(param, function (err, res, body) {
      if (err) {
        reject(err);
        return err;
      }
      let data = JSON.parse(body);
      resolve(data.access_token);
    });
  });
}
