/*
 * The process.nextTick in those tests are used to avoid AssertionError to be caught by a try/catch in the tested code.
 */

require('mocha');
var should = require('should');
var _ = require('lodash');

var app = require(__dirname + '/../lib/application');
var actors = require(__dirname + '/../lib/actors');
var properties = require(__dirname + '/../lib/properties');
var monitoring = require(__dirname + '/../lib/monitoring');
var utils = {
  aid: require(__dirname + '/../lib/utils/aid')
};

describe('framework patterns', function () {

  beforeEach(function (done) {
    app.start({discoveryAddr: 'udp://224.0.0.1:5555'}, done);
  });

  afterEach(function (done) {
    app.removeActor('sample');
    app.removeActor('fake');
    app.stop(done);
  });

  describe('application mecanisms', function () {

    it('inproc request/reply sample->tmp', function (done) {
      var count = 0;
      var id = '';
      app.addActor('sample', function (req) {
        count++;
        var _this = this;
        process.nextTick(function () {
          should.exist(req, 'actor sample : req should exist');
          req.should.have.keys('from', 'to', 'content', 'timeout', 'cb', 'date', 'id', 'headers', 'reply');
          utils.aid.bare(_this.id).should.be.eql('sample', 'actor sample : this.id should be "sample"');
          utils.aid.bare(req.from).should.be.eql('tmp', 'actor sample : req.from should be "tmp"');
          utils.aid.bare(req.to).should.be.eql('sample', 'actor sample : req.to should be "sample"');
          req.content.should.be.eql('hello', 'actor sample : req.content should be "hello"');
          req.timeout.should.be.eql(1500, 'actor sample : req.timeout should be "2000"');
          req.cb.should.be.eql(true, 'actor sample : req.cb.should.be "true"');
          req.date.should.have.type('number', 'actor sample : req.date should be a number');
          req.headers.should.have.type('object', 'actor sample : req.headers should be an object');
          req.headers.should.be.empty;
          req.id.should.have.type('string', 'actor sample : req.id should be a string');
          id = req.id;
          req.reply.should.have.type('function', 'actor sample : req.reply should be a function');
          req.reply(null, 'hi');
        });
      });

      app.send('tmp', 'sample', 'hello', 1500, function (err, res) {
        process.nextTick(function () {
          should.exist(res, 'actor tmp : res should exist');
          res.should.have.keys('from', 'to', 'content', 'err', 'date', 'id', 'headers');
          should.not.exist(res.err, 'actor tmp : res.error should be null');
          utils.aid.bare(res.from).should.be.eql('sample', 'actor tmp : res.from should be "sample"');
          utils.aid.bare(res.to).should.be.eql('tmp', 'actor tmp : res.to should be "tmp"');
          res.content.should.be.eql('hi', 'actor tmp : res.content should be "hi"');
          res.date.should.have.type('number', 'actor tmp : res.date should be a number');
          res.headers.should.have.type('object', 'actor tmp : res.headers should be an object');
          res.headers.should.be.empty;
          res.id.should.have.type('string', 'actor tmp : res.id should be a string');
          res.id.should.be.eql(id, 'actor tmp : res.id should be the same as req.id at actor sample');
          count.should.be.eql(1, 'actor tmp : actor sample code should have been invoked once');
          done();
        });
      });
    });

    it('send failure due to a timeout', function (done) {
      app.send('tmp', 'sample', 'hello', 1, function (err) {
        process.nextTick(function () {
          should.exist(err, 'actor tmp : err should exist (timeout expected)');
          err.should.have.key('code');
          err.code.should.be.eql('TIMEOUT', 'actor tmp : err.code should be "TIMEOUT"');
          done();
        });
      });
    });

    it('middlewares', function (done) {
      var counts = {
        'req_out': 0,
        'req_in': 0,
        'res_out': 0,
        'res_in': 0
      };
      app.use(function (type, msg, next) {
        process.nextTick(function () {
          type.should.be.type('string', 'middleware : type should be a string');
          _.keys(counts).should.containEql(type, 'middleware : type should be in ' + _.keys(counts));
          msg.should.be.type('object', 'middleware : msg should be an object');
          next.should.be.type('function', 'middleware : next should be a function');
          counts[type]++;
          next();
        });
      });

      app.addActor('sample', function (req) {
        req.reply();
      });

      app.send('tmp', 'sample', 'hello', function (err) {
        process.nextTick(function () {
          should.not.exist(err, 'actor tmp : err should not exist');
          _.forEach(counts, function (value, key) {
            value.should.be.eql(1, 'actor tmp : counts["' + key + '"] should be 1');
          });
          done();
        });
      });
    });
  });

  describe('monitoring API', function () {
    afterEach(function (done) {
      monitoring.removeAllListeners();
      done();
    });

    describe('events & status access', function () {
      var discoveryTimeout = properties.discoveryTimeout;
      var discoveryMaxInterval = properties.discoveryMaxInterval;
      var discoveryMinInterval = properties.discoveryMinInterval;

      before(function (done) {
        properties.discoveryTimeout = 210;
        properties.discoveryMinInterval = 100;
        properties.discoveryMaxInterval = 100;
        done();
      });

      after(function (done) {
        properties.discoveryTimeout = discoveryTimeout;
        properties.discoveryMinInterval = discoveryMaxInterval;
        properties.discoveryMaxInterval = discoveryMinInterval;
        done();
      });

      it('events & status through monitoring API (inproc communication)', function (done) {
        var counts = {
          actorAdded: 0,
          actorRemoved: 0,
          reqSent: 0,
          reqReceived: 0,
          resSent: 0,
          resReceived: 0,
          discoveryStart: 0,
          discoveryStop: 0,
          discovery: 0
        };

        var aids = monitoring.actors();
        should.exist(aids);
        aids.should.be.instanceOf(Array);
        var initActorsCount = aids.length;

        monitoring.on('actor added', function (aid, scope) {
          counts.actorAdded++;
          aid.should.have.type('string', 'Actor added aid should be a string');
          scope.should.be.eql('process', 'Actor added scope should be "process"');
        });

        monitoring.on('actor removed', function (aid, scope) {
          counts.actorRemoved++;
          aid.should.have.type('string', 'Actor removed aid should be a string');
          scope.should.be.eql('process', 'Actor removed scope should be "process"');
        });

        monitoring.on('req sent', function (req) {
          should.exist(req, 'Req sent should exist');
          req.should.have.type('object', 'Req sent should be an object');
          counts.reqSent++;
        });

        monitoring.on('req received', function (req) {
          should.exist(req, 'Req received should exist');
          req.should.have.type('object', 'Req received should be an object');
          counts.reqReceived++;
        });

        monitoring.on('res sent', function (res) {
          should.exist(res, 'Res sent should exist');
          res.should.have.type('object', 'Res sent should be an object');
          counts.resSent++;
        });

        monitoring.on('res received', function (req) {
          should.exist(req, 'Res received should exist');
          req.should.have.type('object', 'Res received should be an object');
          counts.resReceived++;
        });

        monitoring.on('discovery started', function (aid) {
          should.exist(aid);
          aid.should.be.eql('sample');
          var discoveries = monitoring.discoveries();
          should.exist(discoveries);
          discoveries.should.have.type('object');
          discoveries.should.have.key(aid);
          counts.discoveryStart++;
        });

        monitoring.on('discovery stopped', function (aid) {
          should.exist(aid);
          aid.should.be.eql('sample');
          var discoveries = monitoring.discoveries();
          should.exist(discoveries);
          discoveries.should.have.type('object');
          counts.discoveryStop++;
        });

        monitoring.on('discovery', function (aid) {
          should.exist(aid);
          aid.should.be.eql('sample');
          counts.discovery++;
        });

        app.addActor('sample', function (req) {
          req.reply();
        });

        aids = monitoring.actors();
        aids.should.have.length(initActorsCount + 1);
        utils.aid.bare(aids[initActorsCount]).should.be.eql('sample');

        app.send('tmp', 'sample', 'Hello', function () {
          app.removeActor('sample');
          process.nextTick(function () {
            counts.actorAdded.should.be.eql(1, 'One actor should have been added');
            counts.actorRemoved.should.be.eql(1, 'One actor should have been removed');
            counts.reqSent.should.be.eql(1, 'One request should have been sent');
            counts.reqReceived.should.be.eql(1, 'One request should have been received');
            counts.resSent.should.be.eql(1, 'One response should have been sent');
            counts.resReceived.should.be.eql(1, 'One response should have been received');

            setTimeout(function () {
              counts.discoveryStart.should.be.eql(1, 'One discovery should have been started');
              counts.discoveryStop.should.be.eql(1, 'One discovery should have been stopped');
              counts.discovery.should.be.eql(3, '4 discoveries should have been processed');
              done();
            }, 310);
          });
        });
      });
    });

    describe('container ping', function () {
      var containerPingTimeout = properties.containerPingTimeout;

      before(function (done) {
        properties.containerPingTimeout = 100;
        done();
      });

      after(function (done) {
        properties.containerPingTimeout = containerPingTimeout;
        done();
      });

      it('ping my own container', function (done) {
        monitoring.pingContainer(properties.ID, function (err) {
          process.nextTick(function () {
            should.not.exist(err);
          });
          done();
        });
      });

      it('ping fake container', function (done) {
        monitoring.pingContainer('fake', function (err) {
          process.nextTick(function () {
            should.exist(err);
            err.should.have.type('object');
            err.should.have.key('code');
            err.code.should.be.eql('TIMEOUT');
            done();
          });
        });
      });
    });
  });
});
