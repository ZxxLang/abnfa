var test = require('./test'),
	core = require('../lib/core');

var grammarThousands = [
		'rules     = 1*(thousands-Number-push [SP])',
		'thousands = 1*3DIGIT--term *("," 3DIGIT--term)',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarThousands2 = [
		'rules     = 1*(thousands--push [SP])',
		'thousands = 1*3DIGIT-Number-term *("," 3DIGIT-Number-term)',
		'DIGIT     = %x30-39',
		'SP        = %x20'
	].join('\n'),
	grammarActions = [
		'rules   = name---ref ["-" action-Action--action]',
		'name    = ALPHA *(ALPHA / DIGIT)',
		'action  = [name---produce] [',
		'          "-" [name---method] [',
		'          "-" [name---property] [',
		'          "-" [name---extra]]]]',
		'ALPHA   = %x41-5A / %x61-7A', 'DIGIT   = %x30-39'
	].join('\n'),
	grammarCalculator = [
		'rules  = Factor---left *(Op-String--op Factor---right)',
		'Factor = Num-Number / "(" rules-Expr ")"',
		'Op     = SumOp / MulOp',
		'SumOp  = "+" / "-"',
		'MulOp  = "*" / "/"',
		'Num    = 1*(%x30-39)'
	].join('\n'),
	grammarCalculator2 = [
		'rules  = Factor---left *(Op---op Factor---right)',
		'Factor = Num-Number-term / "(" rules-Expr ")"',
		'Op     = SumOp / MulOp',
		'SumOp  = "+" / "-"',
		'MulOp  = "*" / "/"',
		'Num    = 1*(%x30-39)'
	].join('\n');

test('actions property', function(t, dump) {
	[
		[
			grammarThousands,
			'0,234 678', '0234678', 'thousands'
		],
		[
			'ast = rules-Array\n' + grammarThousands,
			'0,234 678', '0234678', 'thousands-Array'
		],
		[
			grammarThousands2,
			'0,234 678', '0234678', 'thousands2'
		],
		[
			'ast = rules-Array\n' + grammarThousands2,
			'0,234 678', '0234678', 'thousands2-Array'
		],
		[
			grammarActions,
			'name-produce-method-property-extra', 'nameproducemethodpropertyextra', 'actions'
		],
		[

			'ast = rules-Ref\n' + grammarActions,
			'name-produce-method-property-extra', 'nameproducemethodpropertyextra', 'actions-Ref'
		],
	].forEach(function(a, i) {
		var abnf = a[0],
			src = a[1],
			expected = a[2],
			message = a[3] || i,
			actual = '',
			actions = new core.Actions(src),
			product = core.tokenize(abnf, core.Entries, core.Rules, actions);

		t.errify(product, message)
		product.forEach(function(p) {
			if (!p) return;
			if (p.raw) actual += p.raw
			p.action = Object.assign(Object.create(null), p.action)
		})
		t.equal(actual, expected, message, product)
	});
});

test('actions calculator', function(t, dump) {
	[
		grammarCalculator,
		'ast = rules-Expr\n' + grammarCalculator,
	].forEach(function(grammar) {

		var rules = core.tokenize(grammar, core.Entries, core.Rules);

		t.errify(rules);
		actions = new core.Actions(rules);

		[
			['2*3', '2*3'],
			['1+2*3', '1+2*3'],
			['(1+2)*3', '1+2*3']
		].forEach(function(a) {
			var src = a[0],
				expected = a[1],
				actual = '',
				product = actions.parse(src);

			t.errify(product)

			product.forEach(function(p) {
				if (!p) return;
				if (p.raw) actual += p.raw
				p.action = Object.assign(Object.create(null), p.action)
			})
			t.equal(actual, expected, 'calculator', product)
			// dump(src)
			// dump(product)
		})
	})
})