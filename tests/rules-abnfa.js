var rules,
	test = require('./test'),
	fs = require('fs'),
	core = require('../lib/core'),
	abnfraw = open('grammar/abnfa.abnf');


function open(name) {
	return fs.readFileSync(__dirname + '/../' + name).toString()
}

function reRaw(raw, tok) {
	return Array.isArray(tok) && tok.reduce(reRaw, raw) || raw + tok.raw
}

test('token to raw string', function(t) {
	var expected = abnfraw,
		toks = core.tokenize(abnfraw),
		retrans = new core.Retrans(core.Entries, core.Rules);

	t.type(toks, Array, toks)
	t.equal(toks.reduce(reRaw, ''), expected)
	toks.forEach(retrans.retrans, retrans)
	rules = retrans.retrans(null)
	t.errify(rules)

	let act = new core.Actions(rules)

	t.error(act.err)
	act.parse(abnfraw)
	t.error(act.err)
	return
	for (let a of act.actions) {
		t.dump(a[2].kind == 'P' &&
			`${a[0]}	${a[1]}	${a[2].ref}${a[2].method}` ||
			`${a[0]}	${a[1]}	${a[2].ref}-${a[2].method || ''}-${a[2].key || ''}-${a[2].type || ''}`
		)
	}

})
