var tap = require('tap');
var yaml = require('js-yaml');

tap.pass('wrap tap.test');

function dump(o) {
	console.log('')
	console.log(yaml.safeDump(o))
}

module.exports = function test(what, fn) {
	tap.test(what, function(t) {
		fn(t, dump)
		t.ok(true, 'ok')
		t.end()
	})
}