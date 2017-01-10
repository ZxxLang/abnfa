var
	test = require('./test'),
	fs = require('fs'),
	core = require('../lib/core'),
	abnfraw = open('src/abnfa.abnf');

function open(name) {
	return fs.readFileSync(__dirname + '/../' + name).toString()
}

function reRaw(raw, tok) {
	return Array.isArray(tok) && tok.reduce(reRaw, raw) || raw + tok.raw
}

test('token to raw string', function(t) {
	var expected = abnfraw,
		toks = core.tokenize(abnfraw);
	t.type(toks, Array)
	t.equal(toks.reduce(reRaw, ''), expected)
});

test('entries and Rules', function(t, dump) {
	var bare, rules = core.tokenize(abnfraw, core.Entries, core.Rules);

	t.type(rules, core.Rules, rules.message)

	bare = rules.analyze()
	t.false(bare instanceof Object, '[object Object]')
	dump(bare)
});