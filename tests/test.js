var tap = require('tap');
var yaml = require('js-yaml');
var dumps = [];

tap.pass('wrap tap.test');

tap.on('end', function() {
	if (dumps.length) console.log('dump\n')
	dumps.forEach(function(o) {
		console.log(yaml.safeDump(o))
	})
})


module.exports = function test(what, fn) {
	tap.test(what, function(t) {
		fn(t, function(o) {
			dumps.push(o)
		})
		t.ok(true, 'ok')
		t.end()
	})
}