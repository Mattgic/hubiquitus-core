/**
 * @module middleware sample
 */

var hubiquitus = require(__dirname + "/../../lib/hubiquitus");
var logger = require(__dirname + "/../../lib/logger");
logger.level = "warn";
var utils = {
  aid: require(__dirname + "/../../lib/utils/aid")
};

hubiquitus.start()
  .addActor("toto/1", function (from, content) {
    console.log(this.id + "> from " + from + " : " + content);
  });

console.log("[m1] no filter");
hubiquitus.use(function (message, cb) {
  cb();
});

console.log("[m2] allow only content 'hello'");
hubiquitus.use(function (message, cb) {
  if (message.payload.content !== 'hello') {
    console.log("[m2] content !== 'hello', REJECTED");
  } else {
    cb();
  }
});

console.log("\nSENDING hello");
hubiquitus.send("god", "toto/1", "hello");
setTimeout(function () {
  console.log("\nSENDING yop");
  hubiquitus.send("god", "toto/1", "yop");
}, 1000);
