var tap = require('tap');
var yaml = require('js-yaml');

tap.pass('wrap t.end() and dump');
tap.Test.prototype.addAssert('errify', 1, function(err, message, extra) {
	if (err instanceof Error) {
		this.fail(message, extra)
		throw err
	}
})

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