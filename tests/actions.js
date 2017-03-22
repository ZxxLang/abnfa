"use strict"
var test = require('./test'),
	core = require('../lib/core');

var grammarThousands = [
		'Array     = 1*(Number-to--list- [SP])',
		'Number    = 1*3digit *("," 3digit)',
		'digit     = DIGIT--lit',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsSign = [
		'Array     = 1*(Number-to--list- [SP])',
		'Number    = [sign--lit] 1*3digit *("," 3digit)',
		'sign      = "+" / "-"',
		'digit     = DIGIT--lit',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsOperator = [
		'Array     = 1*(Number-to--list- [SP])',
		'Number    = *sign--lit-sign 1*3digit *("," 3digit)',
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
		'Expression   = ( group--alone /',
		'               UnaryExpr- /',
		'               NumericExpr- )',
		'               [BinaryExpr-ahead-left-]',
		'group        = "(" Expression ")"',
		'UnaryExpr    = minus--lit-operator-prefix Expression--inner-operand',
		'BinaryExpr   = operator--lit-operator-infix Expression--inner-right',
		'NumericExpr  = 1*3DIGIT--lit',
		'minus        = "-"',
		'operator     = ("+" / "-") / ("*" / "/")',
		'thousands    = 1*3DIGIT--lit *("," 3DIGIT--lit)',
		'DIGIT        = %x30-39',
	].join('\n'),
	grammarArithmeticOperand = [
		'Expression  = [minus--lit-operator] (',
		'                "(" Expression--to-operand-list ")" /',
		'                NumericExpr-to-operand-list-)',
		'              *BinaryExpr-forward-operand-list-',
		'UnaryExpr   = Expression--to-operand',
		'BinaryExpr  = operator--lit-operator-infix Expression--to-operand',
		'NumericExpr = thousands',
		'minus       = "-"',
		'operator    = ("+" / "-") / ("*" / "/")',
		'thousands   = 1*3DIGIT--lit *("," 3DIGIT--lit)',
		'DIGIT       = %x30-39',
	].join('\n'),
	arithmetics = [
		//['-1', '- 1'],
		//['1-2*3', '1 - 2 * 3'],
		//['1*2-3', '1 * 2 - 3'],
		//['-1-2*-3', '1 - 2 * - 3'],ß
		['-1*((2--3)*4)', '[[-1]*[[2-[-3]]*4]]'],
		['(((-1*((((2--3)))*4))))', '[[-1]*[[2-[-3]]*4]]'],
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

		product.forEach(group, actual)

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

		t.errify(product, src)

		product.forEach(group, actual)

		t.equal(actual.join(''), expected, 'arithmetic', [src, product, actual])
		dump([src, product])
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

0 && test('actions arithmetic operand', function(t, dump) {
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

		product.forEach(group, actual)

		t.equal(actual.join(' '), expected, 'arithmetic operand', [src, product, actual]);
		//dump([src, product])
	})
})