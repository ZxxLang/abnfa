var tap = require('tap');
var yaml = require('js-yaml');

tap.pass('wrap t.end() and dump');

tap.Test.prototype.addAssert('errify', 1, function(er, message, extra) {
	return (!er || !(er instanceof Error)) &&
		this.pass(message || 'should not error', extra) ||
		this.error(er, message, extra)
})

module.exports = function test(what, fn) {
	tap.test(what, function(t) {
		var msg = 'dump'
		fn(t, function(o) {msg += '\n' + yaml.dump(o)+'...................................................\n'})
		if (msg!='dump') t.push(msg)
		t.ok(true, 'ok')
		t.end()
	})
}