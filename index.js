let
  builder = require('./lib/builder'),
  parser = builder(require('./lib/coder'), null);

exports.builder = builder;
exports.coder = coder;
exports.jscoder = require('./lib/js-coder');
exports.patternize = require('./lib/patternize');

exports.parse = function(source) {
  return parser.parse(source);
};
