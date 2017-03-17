"use strict"
var test = require('./test'),
	core = require('../lib/core');

var grammarThousands = [
		'Array     = 1*(num-Number-to--list [SP])',
		'num       = 1*3digit *("," 3digit)',
		'digit     = DIGIT--lit',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsSign = [
		'Array     = 1*(num-Number-to--list [SP])',
		'num       = [sign--lit] 1*3digit *("," 3digit)',
		'sign      = "+" / "-"',
		'digit     = DIGIT--lit',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsOperator = [
		'Array     = 1*(num-Number-to--list [SP])',
		'num       = *sign--lit-sign 1*3digit *("," 3digit)',
		'sign      = "+" / "-"',
		'digit     = DIGIT--lit-lit',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarActions = [
		'Ref     = name--lit-ref ["-" action-Action-to-action]',
		'name    = ALPHA *(ALPHA / DIGIT)',
		'action  = [name--lit-produce] [',
		'          "-" [name--lit-method] [',
		'          "-" [name--lit-key] [',
		'          "-" [name--lit-flag]]]]',
		'ALPHA   = %x41-5A / %x61-7A', 'DIGIT   = %x30-39'
	].join('\n'),
	grammarArithmetic = [
		'ArithmeticExpr  = ( group--group /',
		'                  UnaryExpr-UnaryExpr /',
		'                  NumericExpr-NumericExpr )',
		'                  [BinaryExpr-BinaryExpr-ahead-left]',
		'group           = "(" ArithmeticExpr ")"',
		'UnaryExpr       = minus--lit-operator-right ArithmeticExpr--behind-operand',
		'BinaryExpr      = operator--lit-operator-binary ArithmeticExpr--behind-right',
		'NumericExpr     = thousands',
		'minus           = "-"',
		'operator        = "+" / "-" / "*" / "/"',
		'thousands       = 1*3DIGIT--lit *("," 3DIGIT--lit)',
		'DIGIT           = %x30-39',
	].join('\n'),
	grammarArithmeticOperand = [
		'ArithmeticExpr  = [minus--lit-operator] ("(" ArithmeticExpr-ArithmeticExpr-to-operand-list ")" / NumericExpr-NumericExpr-to-operand-list)',
		'                  *BinaryExpr-BinaryExpr-forward-operand-list',
		'UnaryExpr       = ArithmeticExpr--to-operand',
		'BinaryExpr      = operator--lit-operator-binary ArithmeticExpr-ArithmeticExpr-to-operand',
		'NumericExpr     = thousands',
		'minus       = "-"',
		'operator    = ("+" / "-") / ("*" / "/")',
		'thousands   = 1*3DIGIT--lit *("," 3DIGIT--lit)',
		'DIGIT       = %x30-39',
	].join('\n'),
	arithmetics = [
		//['-1', '- 1'],
		//['1-2*3', '1 - 2 * 3'],
		//['1*2-3', '1 * 2 - 3'],
		//['-1-2*-3', '1 - 2 * - 3'],
		['-1*2--3', '- 1 * 2 - - 3'],
		//['-(1+2)*3', '- 1 + 2 * 3'],
		//['-1+-2--3+-4', '- 1 + - 2 - - 3 + - 4'],
		//['1+2*3*4', '1 + 2 * 3 * 4'],
		//['1+-2*3-4', '1 + - 2 * 3 - 4'],
		//['-2*34', '- 2 * 34'],
		//['(1+2)*34', '1 + 2 * 34'],
		//['-1,234+-5*-(6-7*8)/9', '- 1234 + - 5 * - 6 - 7 * 8 / 9'],
	];

test('actions property', function(t, dump) {
	[
		[
			grammarThousands,
			'0,234 678', '0234 678', 'thousands', 2
		],
		[
			grammarThousandsSign,
			'-0,234 678', '-0234 678', 'thousands sign', 2
		],
		[
			grammarThousandsOperator,
			'--0,234 678', '-- 0234 678', 'thousands operator', 5
		],
		[
			grammarActions,
			'name-produce-method-key-flag', 'name produce method key flag', 'actions', 6
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
		t.equal(a[4], product.length, message, [src, product, actual])
		product.forEach(function(p) {
			if (p && p.raw) actual.push(p.raw)
		})
		t.equal(actual.join(' '), expected, message, [src, product, actual]);
		//dump([src, product])
	});
});

test('actions arithmetic', function(t, dump) {
	var actions,
		rules = core.tokenize(grammarArithmetic, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	arithmetics.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src, actions.list)

		product.forEach(function(p) {
			if (p.raw) actual.push(p.raw)
		})

		t.equal(actual.join(' '), expected, 'arithmetic', [src, product, actual])
		dump([src, product])
	})
})

test('actions arithmetic operand', function(t, dump) {
	var actions,
		rules = core.tokenize(grammarArithmeticOperand, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	arithmetics.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src, actions.list)

		product.forEach(function(p) {
			if (p && p.raw) actual.push(p.raw)
		})

		t.equal(actual.join(' '), expected, 'arithmetic operand', [src, product, actual]);
		//dump([src, product])
	})
})