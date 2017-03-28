"use strict"
var test = require('./test'),
	core = require('../lib/core');

var grammarThousands = [
		'Array     = 1*(Number- [SP])',
		'Number    = 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsSign = [
		'Array     = 1*(Number- [SP])',
		'Number    = [sign-lit] 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'sign      = "+" / "-"',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousandsOperator = [
		'Array     = 1*(Number- [SP])',
		'Number    = *sign-lit-sign 1*3DIGIT-lit-raw *("," 3DIGIT-lit-raw)',
		'sign      = "+" / "-"',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarActions = [
		'Ref     = name-lit-ref ["-" Action-to-action-]',
		'name    = ALPHA *(ALPHA / DIGIT)',
		'Action  = [name-lit-method] [',
		'          "-" [name-lit-key] [',
		'          "-" [name-lit-type] [',
		'          "-" [name-lit-extra]]]]',
		'ALPHA   = %x41-5A / %x61-7A', 'DIGIT   = %x30-39'
	].join('\n'),
	grammarArithmetic = [
		'Expression   = ( group-alone /',
		'               UnaryExpr-prefix- /',
		'               NumericExpr- )',
		'               [BinaryExpr-infix-left-]',
		'group        = "(" Expression ")"',
		'UnaryExpr    = minus-lit-operator Expression-inner-operand',
		'BinaryExpr   = operator-precedence-operator Expression-inner-right',
		'NumericExpr  = 1*3DIGIT-lit *("," 3DIGIT-lit)',
		'minus        = "-"',
		'operator     = ("+" / "-") / ("*" / "/")',
		'DIGIT        = %x30-39',
	].join('\n'),
	arithmetics = [
		['-1', '[-1]'],
		['1-2*3', '[1-[2*3]]'],
		['1*2-3', '[[1*2]-3]'],
		['-1-2*-3', '[[-1]-[2*[-3]]]'],
		['-1*((2--3)*4)', '[[-1]*[[2-[-3]]*4]]'],
		['(((-1*((((2--3)))*4))))', '[[-1]*[[2-[-3]]*4]]'],
		['-1+-2--3+-4', '[[[[-1]+[-2]]-[-3]]+[-4]]'],
		['1*2/3*4', '[[[1*2]/3]*4]'],
		['1+2/3*4', '[1+[[2/3]*4]]'],
		['-1,234+5', '[[-1234]+5]'],
	];

test('actions property', function(t, dump) {
	[
		[
			grammarActions,
			'ref-method-key-type-extra', 'ref [ method key type extra ]', 'actions'
		],
		[
			grammarThousands,
			'0,234 678', '0234 678', 'thousands',
		],
		[
			grammarThousandsSign,
			'-0,234 678', '-0234 678', 'thousands sign',
		],
		[
			grammarThousandsOperator,
			'+-0,234 678', '[ +- 0234 ] 678', 'thousands operator',
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

		product.forEach(group, actual)

		t.equal(actual.join(' '), expected, message, [src, product, actual]);
		//dump([message, src, product])
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

		t.equal(actual.join(''), expected, 'arithmetic', [src, product, actual]);
		//dump([src, product])
	})
})

function group(p) {
	// if (p.method && 'inner ahead'.indexOf(p.method) != -1)
	// 	this.push('-------------') // error
	if (p.raw) this.push(p.raw)
	if (p.factors) {
		this.push('[')
		p.factors.forEach(group, this)
		this.push(']')
	}
}