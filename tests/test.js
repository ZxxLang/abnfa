var tap = require('tap');
var yaml = require('js-yaml');

if (module === require.main) {
	tap.pass('ok')
	return
}

tap.Test.prototype.errify = function(err, extra) {
	if (err instanceof Error){
		this.error(err, Array.isArray(extra) && extra || [extra])
	}
}

tap.Test.prototype.dump = function() {
	this.push(' \n')
	for (var i = 0; i < arguments.length; i++)
		this.push(yaml.dump(arguments[i]))
}

module.exports = function test(what, fn) {
	tap.test(what, {
		bail: true
	}, function(t) {
		fn(t)
		t.ok(true, 'ok')
		t.end()
	})
}