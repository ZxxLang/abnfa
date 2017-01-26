var rules,
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

test('token to raw string', function(t, dump) {
	var expected = abnfraw,
		toks = core.tokenize(abnfraw),
		retrans = new core.Retrans(core.Entries, core.Rules);

	t.type(toks, Array, toks)
	t.equal(toks.reduce(reRaw, ''), expected)
	toks.forEach(retrans.retrans, retrans)
	rules = retrans.retrans(null)
})
