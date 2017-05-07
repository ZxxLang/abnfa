var tap = require('tap');
var yaml = require('js-yaml');

tap.pass('wrap t.end() and dump');
tap.Test.prototype.errify = function(err, extra) {
	if (err instanceof Error) {
		this.ifErr(err, '',
			Array.isArray(extra) && extra || [extra])
		this.end()
		throw err
	}
}

tap.Test.prototype.dump = function() {
	this.push(' \n')
	for (var i = 0; i < arguments.length; i++)
		this.push(yaml.dump(arguments[i]))
}

module.exports = function test(what, fn) {
	tap.test(what, function(t) {
		fn(t)
		t.ok(true, 'ok')
		t.end()
	})
}