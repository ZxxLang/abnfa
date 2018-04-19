let
  builder = require('./lib/builder'),
  coder = require('./lib/coder');

exports.builder = builder;
exports.coder = coder;
exports.jscoder = require('./lib/js-coder');
exports.patternize = require('./lib/patternize');

exports.parse = function(source) {
  return new builder(coder).parse(source);
};
