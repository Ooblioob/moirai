// Generated by CoffeeScript 1.9.1
(function() {
  var DEFAULT_KEYS, PRIVATE_KEY, Promise, USERNAME, child_process, conf, ec2Client, getRemoteCommand, getSSHCommand, keys;

  Promise = require('pantheon-helpers/lib/promise');

  conf = require('./config');

  ec2Client = require('./ec2Client');

  child_process = require('child_process');

  keys = {};

  PRIVATE_KEY = conf.PRIVATE_KEY_FILE || (process.env.HOME + '/.ssh/id_rsa');

  USERNAME = conf.SSH_USER || 'ec2-user';

  DEFAULT_KEYS = conf.AUTHORIZED_KEY_DEFAULTS || [];

  keys.exec = Promise.denodeify(child_process.exec);

  getSSHCommand = function(host, pubkeys) {
    var remoteCommand;
    remoteCommand = getRemoteCommand(pubkeys);
    return 'ssh -o StrictHostKeyChecking=no -i ' + PRIVATE_KEY + ' ' + USERNAME + '@' + host + ' ' + remoteCommand;
  };

  getRemoteCommand = function(pubkeys) {
    var allKeys;
    allKeys = DEFAULT_KEYS.concat(pubkeys);
    return '"echo -e \'' + allKeys.join('\\n') + '\' > .ssh/authorized_keys"';
  };

  keys.setSSHKeys = function(instance, pubkeys) {
    if (instance.aws_id == null) {
      return Promise.reject('Instance has no aws_id');
    }
    return ec2Client.getSingleInstance(instance.aws_id).then(function(data) {
      var attempts, initialState, makeAttempt;
      initialState = data.State.Name;
      attempts = 0;
      makeAttempt = function() {
        var sshCommand;
        sshCommand = getSSHCommand(instance.ip, pubkeys);
        return keys.exec(sshCommand)["catch"](function(err) {
          if (attempts++ < 4) {
            return Promise.setTimeout(60 * 1000).then(makeAttempt);
          } else {
            return Promise.reject(err);
          }
        });
      };
      if (initialState === 'running' || initialState === 'pending') {
        return makeAttempt();
      } else {
        return ec2Client.startInstances([instance.aws_id]).then(makeAttempt).then(function() {
          return ec2Client.stopInstances([instance.aws_id]);
        });
      }
    });
  };

  module.exports = keys;

}).call(this);
