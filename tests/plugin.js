"use strict"

// http://commonmark.org/

var test = require('./test'),
	core = require('../lib/core'),
	grammarCRLF = [
		'first  = ACTIONS-CRLF 1*(*WSP i-lit- *WSP)',
		'i      = "i"/"h"',
		'WSP    = SP / CRLF',
		'SP     = %x20',
	].join('\n'),

	grammarOUTDENT = [
		'first  = ACTIONS-OUTDENT 1*block-alone',
		'block  = OUTDENT if-',
		'if     = "if true" 1*CWSP out-lit-body *CWSP',
		'out    = "out"',
		'CWSP   = SP / HTAB / CRLF',
		'HTAB   = %x09',
		'SP     = %x20',
	].join('\n');

test('crlf', function(t) {
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
	var actions = core.tokenize(grammarOUTDENT, core.Entries, core.Rules, core.Actions);

	t.errify(actions);

	[
		['if true\nout', ''],
		['if true out', '[out]'],
		['if true\tout', '[out]'],
		['if true\n\tout', '[out]'],
		['if true\n\tout\nif true\n\tout', '[out][out]'],
		['if true\tout\nif true\n\tout', '[out][out]'],
	].forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = this.parse(src);

		if (!expected)
			return Array.isArray(product) &&
				t.error('want error') ||
				t.pass('got error')

		t.errify(product, expected)

		product.forEach(group, actual)

		t.equal(actual.join(''), expected, expected, [product, this.eols.join(','), actual]);

	}, actions)
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

	if (p.factors) {
		this.push('[')
		p.factors.forEach(groupLoc, this)
		this.push(']')
	}
}