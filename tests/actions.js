"use strict"
var test = require('./test'),
	core = require('../lib/core');

var grammarThousands = [
		'Array     = 1*(thousands-Number-to--list [SP])',
		'thousands = 1*3DIGIT--term *("," 3DIGIT--term)',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsSign = [
		'Array     = 1*(*sign--mix-sign thousands-Number-to--list [SP])',
		'thousands = 1*3DIGIT--term *("," 3DIGIT--term)',
		'sign      = "+" / "-"',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarActions = [
		'Ref     = name--term-ref ["-" action-Action-to-action]',
		'name    = ALPHA *(ALPHA / DIGIT)',
		'action  = [name--term-produce] [',
		'          "-" [name--term-method] [',
		'          "-" [name--term-key] [',
		'          "-" [name--term-flag]]]]',
		'ALPHA   = %x41-5A / %x61-7A', 'DIGIT   = %x30-39'
	].join('\n'),
	grammarCalculator = [
		'Expr      = factor--to-left *(op--term-operator-PREC factor--to-right)',
		'factor    = *sign--mix-sign ( thousands-Number / "(" Expr-Expr ")" )',
		'sign      = "+" / "-"',
		'thousands = 1*3DIGIT--term *("," 3DIGIT--term)',
		'DIGIT     = %x30-39',
		'op        = "+" / "-" / "*" / "/"',
		'PRECEDENCES = "%binary" "+" "-" / "%binary" "*" "/"'
	].join('\n');

test('actions property', function(t, dump) {
	[
		[
			grammarThousands,
			'0,234 678', '0234 678', 'thousands'
		],
		[
			grammarThousandsSign,
			'--0,234 678', '-- 0234 678', 'thousands sign'
		],
		[
			grammarActions,
			'name-produce-method-key-flag', 'name produce method key flag', 'actions'
		],
	].forEach(function(a, i) {
		var abnf = a[0],
			src = a[1],
			expected = a[2],
			message = a[3] || i,
			actual = [],
			actions = new core.Actions(src),
			product = core.tokenize(abnf, core.Entries, core.Rules, actions);

		t.errify(product, message)
		product.forEach(function(p) {
			if (p && p.raw) actual.push(p.raw)
		})
		t.equal(actual.join(' '), expected, message, product)

		// if (message == 'thousands')
		// 	dump(product);
	});
});

test('actions calculator', function(t, dump) {
	var actions,
		rules = core.tokenize(grammarCalculator, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	[
		['1+2*34', '1 + 2 * 34'],
		['-2*34', '- 2 * 34'],
		['-+2*34', '-+ 2 * 34'],
		['(1+2)*34', '1 + 2 * 34'],
	].forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product)

		product.forEach(function(p) {
			if (p && p.raw) actual.push(p.raw)
		})

		t.equal(actual.join(' '), expected, 'calculator', product)

		// if (src == '(1+2)*34')
		// 	dump(product);
	})
})