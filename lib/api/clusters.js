// Generated by CoffeeScript 1.9.1
(function() {
  var CLUSTER_MISSING_NAME_ERROR, Promise, _, clusters, couch_utils, doAction, ec2Client, formatClusterId, uuid;

  _ = require('underscore');

  Promise = require('pantheon-helpers/lib/promise');

  ec2Client = require('../ec2Client');

  couch_utils = require('../couch_utils');

  uuid = require('node-uuid');

  doAction = require('pantheon-helpers/lib/doAction');

  CLUSTER_MISSING_NAME_ERROR = "Cluster name not provided";

  clusters = {};

  formatClusterId = function(clusterId) {
    if (clusterId.indexOf('cluster_') === 0) {
      return clusterId;
    } else {
      return 'cluster_' + clusterId;
    }
  };

  clusters.getCluster = function(client, clusterId, callback) {
    return client.use('moirai').get(formatClusterId(clusterId), callback);
  };

  clusters.handleGetCluster = function(req, resp) {
    return clusters.getCluster(req.couch, req.params.clusterId).pipe(resp);
  };

  clusters.getClusters = function(client, opts) {
    var params;
    params = {
      include_docs: true
    };
    if (opts == null) {
      opts = {};
    }
    if (opts.clusterIds) {
      params.keys = opts.clusterIds.map(formatClusterId);
    }
    return client.use('moirai').viewWithList('moirai', 'active_clusters', 'get_docs_without_audit', params, 'promise').then(function(clusters) {
      var awsIds;
      if (_.isEmpty(clusters)) {
        return Promise.resolve([]);
      }
      awsIds = _.chain(clusters).pluck('instances').flatten(true).pluck('aws_id').compact().value();
      if (_.isEmpty(awsIds)) {
        return Promise.resolve(clusters);
      }
      return ec2Client.getInstances(awsIds).then(function(ec2Instances) {
        var ec2InstanceLookup;
        ec2InstanceLookup = {};
        _.each(ec2Instances, function(ec2Instance) {
          var instanceTags;
          instanceTags = {};
          _.each(ec2Instance.Tags, function(tag) {
            return instanceTags[tag.Key] = tag.Value;
          });
          return ec2InstanceLookup[ec2Instance.InstanceId] = {
            instanceType: ec2Instance.InstanceType,
            ip: ec2Instance.PrivateIpAddress,
            state: ec2Instance.State.Name,
            tags: instanceTags
          };
        });
        clusters.forEach(function(cluster) {
          return cluster.instances.forEach(function(instance) {
            if (instance.aws_id) {
              return _.extend(instance, ec2InstanceLookup[instance.aws_id] || {
                state: 'instance does not exist'
              });
            }
          });
        });
        return Promise.resolve(clusters);
      });
    });
  };

  clusters.handleGetClusters = function(req, resp) {
    var clusterOpts;
    clusterOpts = req.query || {};
    if (_.isString(clusterOpts.clusterIds)) {
      clusterOpts.clusterIds = clusterOpts.clusterIds.split(',');
    }
    return clusters.getClusters(req.couch, clusterOpts).then(function(clusters) {
      return resp.send(JSON.stringify(clusters));
    })["catch"](function(err) {
      return resp.status(500).send(JSON.stringify({
        error: 'internal error',
        msg: String(err)
      }));
    });
  };

  clusters.createCluster = function(client, record) {
    if (record.name == null) {
      return Promise.reject(CLUSTER_MISSING_NAME_ERROR);
    }
    record.instances.forEach(function(instance) {
      return instance.id = uuid.v4();
    });
    return doAction(client.use('moirai'), 'moirai', null, {
      a: 'c+',
      record: record
    }, 'promise');
  };

  clusters.handleCreateCluster = function(req, resp) {
    var clusterOpts;
    clusterOpts = req.body || {};
    return clusters.createCluster(req.couch, clusterOpts).then(function(clusterData) {
      return resp.status(201).send(JSON.stringify(clusterData));
    })["catch"](function(err) {
      if (err === CLUSTER_MISSING_NAME_ERROR) {
        return resp.status(400).send(JSON.stringify({
          error: 'Bad Request',
          msg: err
        }));
      } else {
        return resp.status(500).send(JSON.stringify({
          error: 'Internal Error',
          msg: String(err)
        }));
      }
    });
  };

  clusters.destroyCluster = function(client, clusterId, callback) {
    return doAction(client.use('moirai'), 'moirai', formatClusterId(clusterId), {
      a: 'c-'
    }, callback);
  };

  clusters.handleDestroyCluster = function(req, resp) {
    return clusters.destroyCluster(req.couch, req.params.clusterId).pipe(resp);
  };

  clusters.handleAddInstance = function(req, resp) {
    return resp.send('NOT IMPLEMENTED');
  };

  clusters.handleUpdateCluster = function(req, resp) {
    return resp.send('NOT IMPLEMENTED');
  };

  clusters.setKeys = function(client, clusterId, keys, callback) {
    return doAction(client.use('moirai'), 'moirai', formatClusterId(clusterId), {
      a: 'k',
      keys: keys
    }, callback);
  };

  clusters.handleSetKeys = function(req, resp) {
    var keys;
    keys = req.body || [];
    return clusters.setKeys(req.couch, req.params.clusterId, keys).pipe(resp);
  };

  clusters.startCluster = function(client, clusterId, callback) {
    return clusters.getCluster(client, clusterId, 'promise').then(function(cluster) {
      var awsIds;
      awsIds = _.pluck(cluster.instances, 'aws_id');
      return ec2Client.startInstances(awsIds);
    });
  };

  clusters.handleStartCluster = function(req, resp) {
    return clusters.startCluster(req.couch, req.params.clusterId).then(function(aws_resp) {
      return resp.status(201).send(JSON.stringify(aws_resp));
    })["catch"](function(err) {
      return resp.status(500).send(JSON.stringify({
        error: 'internal error',
        msg: String(err)
      }));
    });
  };

  clusters.stopCluster = function(client, clusterId, callback) {
    return clusters.getCluster(client, clusterId, 'promise').then(function(cluster) {
      var awsIds;
      awsIds = _.pluck(cluster.instances, 'aws_id');
      return ec2Client.stopInstances(awsIds);
    });
  };

  clusters.handleStopCluster = function(req, resp) {
    return clusters.stopCluster(req.couch, req.params.clusterId).then(function(aws_resp) {
      return resp.status(201).send(JSON.stringify(aws_resp));
    })["catch"](function(err) {
      return resp.status(500).send(JSON.stringify({
        error: 'internal error',
        msg: String(err)
      }));
    });
  };

  module.exports = clusters;

}).call(this);
