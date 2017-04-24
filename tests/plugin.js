"use strict"

// http://commonmark.org/

var test = require('./test'),
	core = require('../lib/core'),
	grammarCRLF = [
		'first  = ACTIONS-EOF ACTIONS-CRLF 1*(*WSP i-lit- *WSP) EOF',
		'i      = "i"/"h"',
		'WSP    = SP / CRLF',
		'SP     = %x20',
	].join('\n'),

	grammarOUTDENT = [
		'first      = ACTIONS-DENY ACTIONS-OUTDENT ACTIONS-EXISTS',
		'             *CWSP statement *(1*CWSP [statement])',
		'statement  = ifStmt-alone- / block-alone / list-factors- / ident',
		'statements = OUTDENT 1*CWSP statement *(1*CWSP statement)',

		'ifStmt = "if" OUTDENT-else-else EXISTS-test-consequent',
		'         1*CWSP expr-alone-test',
		'         statements-factors-consequent',
		'         [1*CWSP "else" statements-factors-alternate]',
		'else   = "else" 1*CWSP',

		'ident      = Identifier-lit- DENY-keywords',
		'Identifier = ALPHA *(ALPHA / DIGIT)',
		'keywords   = "else" / "if"',

		'expr   = block-alone / list-factors- / ident',
		'block  = "{" OUTDENT-rightBracket--continue *CWSP *expr *CWSP "}" /',
		'         "(" OUTDENT-rightBracket--continue *CWSP *expr *CWSP ")"',
		'list   = "[" OUTDENT-rightBracket--continue *CWSP [expr *("," expr) [","]] *CWSP "]"',

		'rightBracket = "}" / "]" / ")"',

		'CWSP   = SP / HTAB / CRLF',
		'HTAB   = %x09',
		'SP     = %x20',
		'ALPHA  = %x41-5A / %x61-7A', 'DIGIT  = %x30-39'
	].join('\n'),
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

test('outdent', function(t) {
	var actions = core.tokenize(grammarOUTDENT, core.Entries,
			core.Rules, core.Actions),
		actionsSP = core.tokenize(grammarOUTDENT_SP, core.Entries,
			core.Rules, core.Actions);
	//t.dump(actions)
	t.errify(actions);
	t.errify(actionsSP);

	[
		['i','i'],
		['i\nx','ix'],
		['\ni','i'],
		['\ni\nx','ix'],
		['\ti\nx','ix'],
		['\ti\n\tx','ix'],
		['\n\t\ti\nx','ix'],
		['if t\nnewline', ''],
		['if t do', '[t[do]]'],
		['if (t)\n\ti\n\tx', '[t[ix]]'],
		['if (t) {i}', '[t[i]]'],
		['if (t) {\n\ti\n}', '[t[i]]'],
		['if (t) [i]', '[t[[i]]]'],
		['if (t) [\n\ti,x]', '[t[[ix]]]'],
		['if t\ti\tx', '[t[ix]]'],
		['if t\ti\nx', '[t[i]]x'],
		['if t\n\ti\nif t\n\ti', '[t[i]][t[i]]'],
		['if t i\nif t i', '[t[i]][t[i]]'],
		['if t i1 else x', '[t[i1][x]]'],
		['if t\n\ti2\nelse x', '[t[i2][x]]'],
		['if t\n\t\ti3\nelse x', '[t[i3][x]]'],
		['if t\n\t\ti4\nelse x', '[t[i4][x]]'],
		['if t\n\t\ti5\nelse\n\tx', '[t[i5][x]]'],
		['if t i\n\t\ti\nelse x\n\tx\n\tx', '[t[ii][xxx]]'],

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
					t.error('want error', src, product) ||
					t.pass('got error')

			t.errify(product, expected)

			product.forEach(group, actual)

			actual = actual.join('')
			t.equal(actual, expected, expected, [product, expected, actual]);
		}
	})
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