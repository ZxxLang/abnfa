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
		'action    = name--ref ["-" Action-factors-action-]',
		'name      = raw-lit',
		'Action    = [name--method] [',
		'            "-" [name--key] [',
		'            "-" [name--type] [',
		'            "-" [extra--extra]]]]',
		'extra     = extras-lit',
		'extras    = 1*(ALPHA / DIGIT / "-")',
		'raw       = 1*(ALPHA / DIGIT)',
		'ALPHA     = %x41-5A / %x61-7A', 'DIGIT   = %x30-39'
	].join('\n'),
	grammarArithmetic = [
		'Expression   = (NumericExpr- /',
		'                UnaryExpr-prefix- /',
		'                group-alone)',
		'               [BinaryExpr-infix-left-]',
		'group        = "(" Expression ")"',
		'UnaryExpr    = minus-lit-operator Expression-next-operand',
		'BinaryExpr   = operator-precedence-operator Expression-next-right',
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
		['-(1--2)*-3', '[[-[1-[-2]]]*[-3]]'],
		['-1*((2--3)*4)', '[[-1]*[[2-[-3]]*4]]'],
		['(((-1*((((2--3)))*4))))', '[[-1]*[[2-[-3]]*4]]'],
		['-1+-2--3+-4', '[[[[-1]+[-2]]-[-3]]+[-4]]'],
		['1*2/3*4', '[[[1*2]/3]*4]'],
		['1+2/3*4', '[1+[[2/3]*4]]'],
		['-1,234+5', '[[-1234]+5]'],
	],
	grammarExpression = [
		'first        = ACTIONS-CRLF Expression',
		'Expression   = ( NumericExpr- /',
		'               UnaryExpr-prefix- /',
		'               group-alone /',
		'               computed )',
		'               [UpdateExpr-ahead-operand- / BinaryExpr-infix-left- ]',

		'computed     = Ident- *(DotExpr-ahead-object- / IndexExpr-ahead-object- / CallExpr-ahead-callee-)',
		'DotExpr      = "." Ident-to-property-',
		'IndexExpr    = "[" Expression-to-property "]"',
		'CallExpr     = "(" [arguments-factors-arguments] ")"',

		'arguments    = Expression-alone *("," Expression-alone)',

		'group        = "(" Expression ")"',
		'UpdateExpr   = suffix-lit-operator',
		'UnaryExpr    = prefix-lit-operator Expression-next-operand',
		'BinaryExpr   = ( infix-precedence-operator /',
		'               SP infixSymbol-precedence-operator SP)',
		'               Expression-next-right',
		'NumericExpr  = 1*DIGIT-lit',

		'prefix       = "--" / "++" / "-"',
		'suffix       = "--" / "++"',
		'infix        = ("") / ("") / ("+" / "-") / ("*" / "/")',
		'infixSymbol  = ("or") / ("and")',

		'Ident        = 1*ALPHA-lit',
		'SP           = %x20',
		'ALPHA        = %x41-5A / %x61-7A',
		'DIGIT        = %x30-39',
	].join('\n'),
	expressions = [
		['i', 'i'],
		['i.j', '[ij]'],
		['i.j.k', '[[ij]k]'],
		['i.j.k.l', '[[[ij]k]l]'],
		['i[j]', '[ij]'],
		['i()', '[i]'],
		['i.j()', '[[ij]]'],
		['i.j(1)', '[[ij][1]]'],
		['i(j+2)', '[i[[j+2]]]'],
		['i(j+2,k)', '[i[[j+2]k]]'],
		['i.i(j+2,k)', '[[ii][[j+2]k]]'],
		['i++', '[i++]'],
		['++i', '[++i]'],
		['++i++', '[++[i++]]'],
		['i.j()+k*l', '[[[ij]]+[k*l]]'],
		['i and k or l', '[[iandk]orl]'],
		['i.i(j+2,k)+i and k or l', '[[[[[ii][[j+2]k]]+i]andk]orl]'],
	],
	grammarSubject = [
		'first        = ACTIONS-CRLF Expression',
		'Expression   = ( NumericExpr- /',
		'               UnaryExpr-prefix- /',
		'               group-alone /',
		'               subject)',
		'               [UpdateExpr-ahead-operand- / BinaryExpr-infix-left- ]',

		'subject      = Ident- [Subject-ahead-]',
		'Subject      = *(DotExpr- / ListExpr-factors- / CallExpr-factors-)',
		'DotExpr      = "." Ident',
		'ListExpr     = "[" [Expression-alone *("," Expression-alone)] "]"',
		'CallExpr     = "(" [Expression-alone *("," Expression-alone)] ")"',

		'group        = "(" Expression ")"',
		'UpdateExpr   = suffix-lit-operator',
		'UnaryExpr    = prefix-lit-operator Expression-next-operand',
		'BinaryExpr   = ( infix-precedence-operator /',
		'               SP infixSymbol-precedence-operator SP)',
		'               Expression-next-right',
		'NumericExpr  = 1*DIGIT-lit',

		'prefix       = "--" / "++" / "-"',
		'suffix       = "--" / "++"',
		'infix        = ("") / ("") / ("+" / "-") / ("*" / "/")',
		'infixSymbol  = ("or") / ("and")',

		'Ident        = 1*ALPHA-lit',
		'SP           = %x20',
		'ALPHA        = %x41-5A / %x61-7A',
		'DIGIT        = %x30-39',
	].join('\n'),
	subjects = [
		['i', 'i'],
		['i.j', '[ij]'],
		['i.j.k', '[ijk]'],
		['i.j.k.l', '[ijkl]'],
		['i[j]', '[i[j]]'],
		['i()', '[i[]]'],
		['i.j()', '[ij[]]'],
		['i.j(1)', '[ij[1]]'],
		['i(j+2)', '[i[[j+2]]]'],
		['i(j+2,k)', '[i[[j+2]k]]'],
		['i.i(j+2,k)', '[ii[[j+2]k]]'],
		['i.j()+k*l', '[[ij[]]+[k*l]]'],
		['k*l+i.j()', '[[k*l]+[ij[]]]'],
		['i.i(j+2,k)[3]', '[ii[[j+2]k][3]]'],
	],
	grammarObject = '\n\
		first   = Number- / Object-factors-\n\
		Object  = "{" [Pair- *("," Pair-)] "}"\n\
		Pair    = 1*ALPHA-lit ":" first\n\
		Number  = 1*DIGIT-lit\n\
		ALPHA   = %x41-5A / %x61-7A\n\
		DIGIT   = %x30-39',
	object = [
		['{a:1,b:{c:2}}', '[a1b[c2]]'],
	];

test('actions property', function(t) {
	[
		[
			grammarActions,
			'ref-method-key-type-extra-extra', 'ref [ method key type extra-extra ]', 'actions'
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
			'+-0,234 678', '[ +- 0234 ] [ 678 ]', 'thousands operator',
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
		actual = actual.join(' ')
		t.equal(actual, expected, message, [src, product, actual]);
	});
});

test('actions arithmetic', function(t) {
	var actions,
		rules = core.tokenize(grammarArithmetic, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	arithmetics.forEach(function(a,i) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src)

		product.forEach(group, actual)
		actual = actual.join('')
		t.equal(actual, expected, 'arithmetic', [src, product, actual, expected]);
	})
})

test('actions expression', function(t) {
	var actions,
		rules = core.tokenize(grammarExpression, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	expressions.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src)

		product.forEach(group, actual)
		actual = actual.join('')
		t.equal(actual, expected, 'expression', [src, product, actual, expected]);
	})
});

test('actions subject', function(t) {
	var actions,
		rules = core.tokenize(grammarSubject, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	subjects.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src)

		product.forEach(group, actual)
		actual = actual.join('')
		t.equal(actual, expected, 'subject', [src, product, actual, expected]);
	})
});

test('object', function(t) {
	var actions,
		rules = core.tokenize(grammarObject, core.Entries, core.Rules);

	t.errify(rules);
	actions = new core.Actions(rules);

	object.forEach(function(a) {
		var src = a[0],
			expected = a[1],
			actual = [],
			product = actions.parse(src);

		t.errify(product, src)

		product.forEach(group, actual)
		actual = actual.join('')
		t.equal(actual, expected, 'custom', [src, expected, actual, product]);
	})
});

test('ident', function(t) {
	var grammar = '\
		first = ident-lit--Ident\n\
		ident = 1*ALPHA [["-"] 1*(ALPHA / DIGIT)]\n\
		ALPHA = %x41-5A / %x61-7A\n\
		DIGIT = %x30-39',
		product = core.tokenize(grammar, core.Entries, core.Rules,
			new core.Actions('utf-8'));

	t.errify(product)
	t.equal(product.length, 1)
	t.equal(product[0].raw, 'utf-8')
});

function group(p) {
	if (p.raw) this.push(p.raw)
	if (p.factors) {
		this.push('[')
		p.factors.forEach(group, this)
		this.push(']')
	}
}