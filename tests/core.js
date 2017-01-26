var
	test = require('./test'),
	core = require('../lib/core');

test('retrans reduce', function(t) {
	var d = new core.Retrans(core.Retrans)
	d.retrans('1')
	d.retrans('2')
	t.same(d.retrans(null), [
		['1', '2']
	])
})

test('retrans transform', function(t) {
	var form = {};
	form.retrans = function(s) {
		return s != null && s + s || null
	}

	var d = new core.Retrans(core.Trans, form)

	d.retrans(1)
	d.retrans(2)
	t.same(d.retrans(null), [2, 4])
})

test('tokenize unexpected matching', function(t) {
	var tests = [
		['symbols', '"1"'],
		['symbols', '1"1"'],
		['symbols', '<1>'],
		['symbols', '[r]'],
		['symbols', '(r]'],
		['symbols', '*r'],
		['brackets', 'r = ( [ )]'],
		['brackets', 'r = (]'],
		['brackets', 'r = ()]'],
		['brackets', 'r = ()[]('],
		['brackets', 'r = ()[])'],
		['incomplete', 'r'],
		['incomplete', 'r='],
		['incomplete', 'r ='],
		['incomplete', 'r =\nr = "1"'],
		['incremental', 'r = ( / )'],
		['incremental', 'r = "1" / '],
		['defined-as', 'r r = "eof"'],
		['defined-as', 'r "" = "eof"'],
		['defined-as', ' = "eof"'],
		['defined-as', 'r = "" = "1"'],
		['DQUOTE', 'r = "'],
		['DQUOTE', 'r = %s'],
		['DQUOTE', 'r = %idd'],
		['DQUOTE', 'r = %i<dd>'],
		['DQUOTE', 'r = %s "dd"'],
		['prose', 'r = <'],
		['symbols', 'r = <"">>'],
		['symbols', 'r = %f"s"'],
		['repeat', 'r = *1 ""'],
		['repeat', 'r = 1*1*'],
		['empty', ''],
		['empty', ';']
	];

	tests.forEach(function(a, i) {
		var err = core.tokenize(a[1]);
		t.type(err, Error);
		t.has(err.message, a[0], a[1])
	})
});


test('tokenize c-nl', function(t) {
	var tests = [
		'r = "1"',
		'r \n = <>',
		'r \n = \n\t%s""',
		'r ;\n = ;\n\t""',
		'	r = "1"',
		'\n\tr = "1"\n\tx=r',
	];

	tests.forEach(function(s, i) {
		t.errify(core.tokenize(s))
	})
});

test('tokenize num range', function(t, dump) {
	var tests = [
		'r = %b0101-1000',
		'r = %b0101.1000',
		'r = %d90-100',
		'r = %d90.1000',
		'r = %xaF.fA.9a.9F',
		'r = %x9F-f9',
	];

	tests.forEach(function(s, i) {
		var rules = core.tokenize(s, core.Entries, core.Rules)
		t.errify(rules)
	})
});

test('calculator', function(t) {
	var text = [
		'Expr   = Term   *Sum',
		'Term   = Factor *Mul',
		'Sum    = SumOp  Term',
		'Mul    = MulOp  Factor',
		'Factor = Num / "(" Expr ")"',
		'SumOp  = "+" / "-"',
		'MulOp  = "*" / "/"',
		'Num    = 1*(%x30-39)'
	].join('\n')

	var rules = core.tokenize(text, core.Entries, core.Rules);

	t.errify(rules)
});

test('rule unexpected', function(t) {
	[
		['incremental', 'r =/ c'],
		['duplicates', 'r = c\nr = d']
	].forEach(function(a) {
		var err = core.tokenize(a[1], core.Entries, core.Rules)
		t.type(err, Error)
		t.has(err.message, a[0])
	})
})

test('rule reduce', function(t) {
	[
		[
			'r = x [ 2*3("." x) / ("-" x) ]',
			'r = 1x [ 2*3("." 1x) / ("-" 1x) ]',
			'r = 1*1x [ 2*3("." 1*1x) / ("-" 1*1x) ]'
		],
		[
			'r = 2x [ 3x 4x ]',
			'r = 2x [ (3x 4x) ]',
			'r = 2x [ (3x) (4x) ]'
		],
		[
			'r = x / ( x / x )',
			'r = x / x / x'
		],
		[
			'r = x / x x',
			'r = x / (x x)',
		],
		[
			'r = a / b',
			'r = a\nr =/ b'
		],
		[
			'r = (x x)/x',
			'r = x x/x',
		],
		[
			'r = (x  x) / x x',
			'r = x  x / x x',
			'r = x  x / (x x)',
			'r = (x  x) / (x x)'
		],
		[
			'r = x (x / x [x x]) [x]',
			'r = x (((x / (x [x x]))) [x])',
			'r = (x ((x / (x [x x])))) [x]'
		],
		[
			'r = a 2(b / c)',
			'r = a 2((b / c))',
			'r = a (2(b / c))',
		],
		[
			'r = 1*(x / x)',
			'r = (1*((((((x / (((((((x))))))))))))))',
		],
		[
			'r = 1*(x / x) x',
			'r = (1*((((((x / (((((((x)))))))))))))) x',
		],
	].forEach(rules, t)
});

function rules(tests) {
	var expected, t = this;
	tests.forEach(function(s) {
		var cr = new core.Rules()
		var entries = core.tokenize(s, core.Entries)

		t.type(entries, Array)

		entries.forEach(function(toks) {
			t.same(cr.retrans(toks), null)
		})

		var actual = cr.retrans(null);

		expected = expected || actual;

		t.deepEqual(actual, expected, s)
	})

	//t.ok(0, 'dump', expected)
}

test('rules', function(t) {
	var text = '\
		r = a b\n\
		b = %s"string"\n\
		a = c\n\
		d = x'

	var bare = core.tokenize(text, core.Entries, core.Rules);

	t.errify(bare)

	t.deepEqual(bare.undefs, ['c', 'x'], 'undefs')
	t.deepEqual(bare.unrefs, ['d'], 'unrefs')
	t.deepEqual(bare.literals, ['string'], 'literals')
});