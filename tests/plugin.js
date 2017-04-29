"use strict"

// http://commonmark.org/

var test = require('./test'),
	core = require('../lib/core'),
	ason = require('../lib/ason'),
	grammarCRLF = [
		'first  = ACTIONS-EOF ACTIONS-CRLF 1*(*WSP i-lit- *WSP) EOF',
		'i      = "i"/"h"',
		'WSP    = SP / CRLF',
		'SP     = %x20',
	].join('\n'),
	grammarFLAG = [
		'first   = ACTIONS-FLAG Object- *(" " Object-)',
		'Object  = "." Member--property- FLAG-pub / Member--property-',
		'Member  = 1*ALPHA-lit',
		'ALPHA   = %x41-5A / %x61-7A',
	].join('\n'),
	grammarOUTDENT = '\n\
		first      = ACTIONS-DENY ACTIONS-OUTDENT ACTIONS-OWN\n\
		             *CWSP statement *(1*CWSP [statement])\n\
		statement  = ifStmt-alone- / block-alone / list-factors- / ident\n\
		statements = OUTDENT 1*CWSP statement *(*WSP CRLF 1*WSP statement)\n\
		ifStmt = "if" OUTDENT-else-else OWN-test-consequent\n\
		         1*CWSP expr-alone-test\n\
		         (1*WSP statement-factors-consequent [1*WSP "else" statements-factors-alternate] /\n\
		         statements-factors-consequent)\n\
		         [1*CWSP "else" statements-factors-alternate]\n\
		else   = "else" 1*CWSP\n\
		ident      = Identifier-lit- DENY-keywords\n\
		Identifier = ALPHA *(ALPHA / DIGIT)\n\
		keywords   = "else" / "if" / predefine \n\
		predefine  = "iota" / "void"\n\
		expr   = block-alone / list-factors- / ident\n\
		block  = "{" OUTDENT-rightBracket--continue *CWSP *expr *CWSP "}" /\n\
		         "(" OUTDENT-rightBracket--continue *CWSP *expr *CWSP ")"\n\
		list   = "[" OUTDENT-rightBracket--continue *CWSP [expr *("," expr) [","]] *CWSP "]"\n\
		rightBracket = "}" / "]" / ")"\n\
		WSP    = SP / HTAB\n\
		CWSP   = WSP / CRLF\n\
		HTAB   = %x09\n\
		SP     = %x20\n\
		ALPHA  = %x41-5A / %x61-7A\n\
		DIGIT  = %x30-39',
	grammarOUTDENT_SP = grammarOUTDENT.replace('ACTIONS-OUTDENT',
		'ACTIONS-OUTDENT-SP');

test('crlf and eof', function(t) {
	var actions = core.tokenize(grammarCRLF, core.Entries, core.Rules, core.Actions);

	t.errify(actions);

	[
		['i', 'i(1:1-1:2)'],
		['i\n', 'i(1:1-1:2)'],
		['i ii', 'i(1:1-1:2)i(1:3-1:4)i(1:4-1:5)'],
		['i\ni ii', 'i(1:1-1:2)i(2:1-2:2)i(2:3-2:4)i(2:4-2:5)'],
		['i\n\ni  ', 'i(1:1-1:2)i(3:1-3:2)'],
		['h\n\nh\n', 'h(1:1-1:2)h(3:1-3:2)'],
		['i\n\n i  ', 'i(1:1-1:2)i(3:2-3:3)'],
		['i\n\n i i\n', 'i(1:1-1:2)i(3:2-3:3)i(3:4-3:5)'],
	].forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = this.parse(src);

		t.errify(product, expected)

		product.forEach(groupLoc, actual)

		t.equal(actual.join(''), expected, expected, [product, this.eols.join(','), actual]);

	}, actions)
})

test('flag', function(t) {
	var actions = core.tokenize(grammarFLAG,
		core.Entries, core.Rules, core.Actions);

	t.errify(actions);

	[
		['i', 'Object[Member~property"i"]'],
		['.i', 'Object[Member-pub~property"i"]'],
		['i .x', 'Object[Member~property"i"],Object[Member-pub~property"x"]'],
	].forEach(function(a) {

		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src)
		actual = ason.serialize(product)
		t.equal(actual, expected, src, [expected, actual, product]);
	})
})

test('outdent', function(t) {
	var actions = core.tokenize(grammarOUTDENT, core.Entries,
			core.Rules, core.Actions),
		actionsSP = core.tokenize(grammarOUTDENT_SP, core.Entries,
			core.Rules, core.Actions);

	t.errify(actions);
	t.errify(actionsSP);

	[
		['i', 'i'],
		['i\nx', 'ix'],
		['\ni', 'i'],
		['\ni\nx', 'ix'],
		['\ti\nx', 'ix'],
		['\ti\n\tx', 'ix'],
		['\n\t\ti\nx', 'ix'],
		['if t\nnewline', ''],
		['if t do', '[t[do]]'],
		['if (t)\n\ti\n\tx', '[t[ix]]'],
		['if (t) {i}', '[t[i]]'],
		['if (t) {\n\ti\n}', '[t[i]]'],
		['if (t) [i]', '[t[[i]]]'],
		['if (t) [\n\ti,x]', '[t[[ix]]]'],
		['if t\ti', '[t[i]]'],
		['if t\ti\nx', '[t[i]]x'],
		['if t\n\ti\nif t\n\ti', '[t[i]][t[i]]'],
		['if t i\nif t i', '[t[i]][t[i]]'],
		['if t single else x', '[t[single][x]]'],
		['if t\n\ti2\nelse x', '[t[i2][x]]'],
		['if t\n\t\ti3\nelse x', '[t[i3][x]]'],
		['if t\n\t\ti4\nelse x', '[t[i4][x]]'],
		['if t\n\t\ti5\nelse\n\tx', '[t[i5][x]]'],
		['if t \n\t\ti\nelse x\n\tx\n\tx', '[t[i][xxx]]'],

		['\n\tif t\n\t\ti\nif t\n\ti', '[t[i]][t[i]]'],
	].forEach(function(a, i) {
		var product, src = a[0],
			expected = a[1],
			actual;

		for (i = 0; i < 2; i++) {
			actual = []
			product = !i && actions.parse(src) ||
				actionsSP.parse(src.replace(/\t/g, ' '));

			if (!expected)
				return Array.isArray(product) &&
					t.fail(src, product) ||
					t.pass('got error')

			t.errify(product, expected)

			product.forEach(group, actual)

			actual = actual.join('')
			t.equal(actual, expected, expected, [product, expected, actual]);
		}
	});

	[
		['iota', 'if iota i'],
		['void', 'if void i'],
		['iota', 'if t\n\tiota'],
		['iota', 'if t\n\ti\nelse iota'],
		['iota', 'if t\n\ti\nelse \n\t\tiota'],
	].forEach(function(a) {
		var err = actions.parse(a[1]);
		t.type(err, Error)
		t.has(err.message, a[0], a[1])
	});

})

function group(p) {
	if (p.raw) this.push(p.raw)
	if (p.factors) {
		this.push('[')
		p.factors.forEach(group, this)
		this.push(']')
	}
}

function groupLoc(p) {
	var loc = p.loc;
	if (p.raw) this.push(p.raw)

	this.push('(' +
		loc.startLine + ':' + loc.startCol + '-' +
		loc.endLine + ':' + loc.endCol + ')')
}