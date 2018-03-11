/**
To build

let md=require('./grammar');
require('./pattern')(md.formnames,md.formulas);
require('fs').writeFileSync('./coder.js',require('./coder-js')(md));
*/
let metadata = {
  mode: 'string',
  typefield: 'type',
  locfield:  'loc',
  crlf: '',
  indent: '',
  infix: null,
  custom: {
    language:  'ABNFA',
    fileTypes: ['abnf'],
    scopeName: 'source.abnf',
    description: 'ABNFA to AST'
  },
  typenames:  [],
  types:      [],
  formnames:  [],
  formulas:   [],
  comments:   []
};

type('metadata', 'struct', null , {
  mode: field('string', null, 'string'),
  typefield: field('string', null, 'type'),
  locfield:  field('string', null, 'loc'),
  crlf:      field('string'),
  indent:    field('string'),
  infix:     field('type', ['infix']),
  custom:    field('object', ['STRING','stringList']),
  typenames: field('unique', ['STRING']),
  types:     field('array',  ['type']),
  formnames: field('unique', ['STRING']),
  formulas:  field('array',
    ['list','action','string','codes','bits','index']
  ),
  comments:  field('array', ['comment'])
});

type('stringList' , 'array', ['STRING']);

type('type', 'struct', null , {
  kind:       field('string'),
  fields:     field('object', ['field']),
  annotation: field('array',  ['STRING'])
});
type('field', 'STRUCT', null , {
  kind:      field('string'),
  value:     field('string'),
  annotation: field('array', ['STRING'])
});
type('infix', 'struct' , null, {
  types:    field('array', ['STRING']),
  left:     field('string'),
  operator: field('string'),
  right:    field('string'),
  priority: field('array', ['stringList'])
});
type('repeat', 'struct', null, {
  min:  field('int', null, '1'),
  max:  field('int', null, '1')
});
type('list', 'struct', null, {
  repeat: field('mixins'),
  choice: field('bool', null, 'false'),
  factor: field('array',
    ['list','action','string','codes','bits','index']
  )
});
type('codes', 'struct', null, {
  repeat: field('mixins'),
  value:   field('array', ['RUNE']),
  isRange: field('bool', null, 'false')
});
type('bits', 'struct' , null, {
  repeat: field('mixins'),
  value:   field('array',  ['U8']),
  isRange: field('bool', null, 'false')
});
type('string', 'struct' , null, {
  repeat: field('mixins'),
  value: field('string'),
  sensitive: field('bool', null, 'true')
});
type('action', 'struct', null, {
  repeat: field('mixins'),
  refer:  field('string'),
  name:   field('string'),
  factor: field('array', ['STRING', 'INT'])
});
type('index', 'struct', null, {
  repeat: field('mixins'),
  refer:  field('int', null, '0'),
  action: field('int', null, '0')
});
type('comment', 'struct', null, {
  value: field('string')
});

function type(name, kind, annotation, fields) {
  metadata.typenames.push(name);
  metadata.types.push({kind, fields, annotation});
}

function field(kind, anno, value) {
  return {kind, value: value || '', annotation: anno || null};
}

function map(factors) {
  return factors.map(function(factor) {
    return typeof factor === 'string' && act(factor) || factor;
  });
}

function act(action) {
  let refer = action.split('--', 1)[0],
    name = '', factor = [],s;
  action = action.slice(refer.length + 2);
  if (action) {
    name = action.split('(', 1)[0];
    action = action.slice(name.length + 1, -1).trim();

    while (action) {
      if (action[0] === '\'') {
        s = action.split('\'', 2)[1];
        action = action.slice(s.length + 2).trim().slice(1).trim();
      }else {
        s = action.split(',', 1)[0];
        action = action.slice(s.length + 1).trim();
        s = s.trim();
        let n = parseInt(s);
        if (!isNaN(n) && n.toString() === s) {
          factor.push(n);
          continue;
        }
      }

      factor.push(s);

    }
  }

  return {type: 'action', min: 1, max: 1, refer, name, factor};
}

function reduce(list) {
  if (list.type !== 'list')
    return list;

  let factor = list.factor.map(reduce),
    item = factor.length === 1 && factor[0] || null;

  if (item) {
    if (list.min === 1 && list.max === 1)
      return item;
    if (item.min === 1 && item.max === 1) {
      item.min = list.min;
      item.max = list.max;
      return item;
    }
  }

  return {
    type: 'list',
    min: list.min,
    max: list.max,
    choice: list.choice,
    factor: factor
  };
}

function rule(name, ...factor) {
  if (factor.length !== 1)
    factor = alt(...factor);
  else
    factor = map(factor)[0];

  metadata.formnames.push(name);
  metadata.formulas.push(reduce(factor));
}

function alt(...factor) {
  factor = map(factor);
  return {type: 'list', min: 1, max: 1, choice: true, factor};
}

function seq(...factor) {
  factor = map(factor);
  return {type: 'list', min: 1, max: 1, choice: false, factor};
}

function rep(min, max, ...factor) {
  if (factor.length === 1)
    factor = map(factor)[0];
  else
    factor = seq(...factor);
  factor.min = min;
  factor.max = max;
  return factor;
}

function opt(...factor) {
  return rep(0, 1, ...factor);
}

function more(...factor) {
  return rep(1, -1, ...factor);
}

function any(...factor) {
  return rep(0, -1, ...factor);
}

function range(first, last) {
  return {type: 'codes', min: 1, max: 1, value: [first, last], isRange: true};
}

function rune(rune) {
  return {type: 'codes', min: 1, max: 1, value: [rune], isRange: false};
}

function lit(value) {
  return {type: 'string', min: 1, max: 1, value, sensitive: true};
}

rule('first', seq(
  any('c-nl'), 'metadata', more('c-nl'), 'rulelist'
));

rule('metadata', seq(
  lit('ABNF-Actions-Metadata'), 'defined-as',
  'meta', any(more('c-nl'), more('WSP'), 'meta')
));

rule('meta',
  seq(lit('to-'), alt(
    seq(
      lit('mode'), more('WSP'),
      lit('\''), more('ALPHA--STRING(mode)'), lit('\'')
    ),
    seq(
      lit('crlf'), more('WSP'),
      lit('\''), any('quotes-vchar--STRING(crlf,unescape)'), lit('\'')
    ),
    seq(
      lit('indent'), more('WSP'),
      lit('\''), any('quotes-vchar--STRING(indent,unescape)'), lit('\'')
    ),
    seq(
      lit('locfield'), more('WSP'),
      lit('\''), any('quotes-vchar--STRING(locfield,unescape)'), lit('\'')
    ),
    seq(
      lit('typefield'), more('WSP'),
      lit('\''), any('quotes-vchar--STRING(typefield,unescape)'), lit('\'')
    ),
    seq(
      lit('infix'), more('WSP'), 'infix--infix(infix)'
    ),
    'custom--PROPERTY(custom)',
    'to--fault(\'Illegal configuration %q\',-3)'
  )),
  seq(
    'rulename--STRING(typenames)', more('WSP'),
    alt(
      'type-declare--type(types)',
      'to--fault(\'Illegal type annotation %q\', typenames)'
    )
  )
);

rule('custom', seq(
  'rulename--STRING', more('WSP'),
  alt(
    'string',
    seq(
      lit('['), any('WSP'), 'strings--ARRAY(VALUE)', any('WSP'), lit(']')
    ),
    'to--fault(\'Invalid custom configuration %q\')'
  )
));

rule('or', seq(more('c-wsp'), lit('/'), more('c-wsp')));

rule('strings', seq(
  'string', any('or', 'string')
));

rule('string', seq(
  lit('\''), any('quotes-vchar--STRING(VALUE, unescape)'), lit('\'')
));

rule('quotes-vchar',
  alt(
    range(0x20, 0x21), range(0x23, 0x26), rune(0x28), range(0x2A, 0x5B), range(0x5D, 0x7E)
  ),
  seq(lit('\\'), alt(
    lit('"'), lit('\''), lit('\\'),
    seq(lit('x'), rep(2, 2, 'HEXDIG')),
    seq(lit('u'), alt(
      seq(lit('{'), rep(1, 6, 'HEXDIG'), lit('}')),
      rep(4, 4, 'HEXDIG')
    ))
  ))
);

rule('infix', seq(
  lit('('), 'c-wsp',
    lit('node'),     more('WSP'), 'string', 'to--rename(VALUE,node)', more('c-wsp'),
    lit('left'),     more('WSP'), 'string', 'to--rename(VALUE,left)', more('c-wsp'),
    lit('operator'), more('WSP'), 'string', 'to--rename(VALUE,operator)', more('c-wsp'),
    lit('right'),    more('WSP'), 'string', 'to--rename(VALUE,right)', more('c-wsp'),
    lit('priority'), more('WSP'),
      lit('['), any('c-wsp'),
        'infixes--ARRAY(priority)',
        any(more('c-wsp'), 'infixes--ARRAY(priority)'),
      any('c-wsp'), lit(']'),
  'c-wsp', lit(')')
));

rule('infixes', seq(
  lit('['), any('c-wsp'),
    'string', any('or', 'string'),
  any('c-wsp'), lit(']')
));

rule('type-declare',
  seq(
    lit('('),
    more(more('c-wsp'), 'field-declare--PROPERTY(fields)'),
    more('c-wsp'), lit(')'), 'to--STRING(kind, struct)'
  ),
  'type-annotation'
);

rule('field-declare', seq(
  'rulename--STRING(KEY)', more('WSP'), alt(
    'field-annotation--field(VALUE)',
    'to--fault(\'Invalid type-annotation on field %s\', KEY)'
  )
));

rule('type-annotation',
  seq(lit('array'),   opt('annotation'), 'to--STRING(kind, array)'),
  seq(lit('unique'),  opt('annotation'), 'to--STRING(kind, unique)'),
  seq(lit('object'),  opt('annotation'), 'to--STRING(kind, object)'),
  seq(lit('map'),     opt('annotation'), 'to--STRING(kind, map)'),
  seq(lit('embedded'), opt('annotation'), 'to--STRING(kind, embedded)'),
  seq(lit('null'),    'annotation',     'to--STRING(kind, null)'),
  seq(lit('mixins'),                    'to--STRING(kind, mixins)'),
  seq('annotation',                     'to--STRING(kind, type)')
);

rule('field-annotation',
  'type-annotation',
  seq(lit('%d'), more('DIGIT--STRING(value)'), 'to--STRING(kind, int)'),
  seq(
    lit('\''), any('quotes-vchar--STRING(value,unescape)'), lit('\''),
    'to--STRING(kind, string)'
  ),
  seq('bool-val--STRING(value)', 'to--STRING(kind, bool)')
);

rule('bool-val',
  lit('true'), lit('false')
);

rule('annotation', seq(
  lit('<'),
    'rulename--STRING(annotation)',
    any(lit(','), opt('SP'), 'rulename--STRING(annotation)'),
  lit('>')
));

rule('rulename', seq(
  'ALPHA', any(opt(lit('-')), alt('ALPHA', 'DIGIT'))
));

rule('defined-as', seq(
  any('c-wsp'), lit('='), any('c-wsp')
));

rule('c-wsp', 'WSP', seq('c-nl', 'WSP'));

rule('c-nl', seq(
  opt('comment--comment(/comments)'), more('to--eol')
));

rule('comment', seq(
  lit(';'), 'comment-val--STRING(value)'
));
rule('comment-val', any(alt('WSP', 'VCHAR')));

rule('rulelist', seq(
  'rule', any(any('WSP'), 'c-nl', opt('rule'))
));

rule('rule', seq(
  'rulename--STRING(forms)', 'defined-as',
  'alternation--pending(formulas)'
));

rule('alternation', seq(
  'concatenation--pending(factor)',
  alt(
    seq(
      more('or', 'concatenation--list(factor)'),
      'to--true(choice)', 'to--type(list)'
    ),
    'to--discard'
  )
));

rule('concatenation', seq(
  'repetition--list(factor)',
  alt(
    seq(
      more(more('c-wsp'), 'repetition--list(factor)'),
      'to--type(list)'
    ),
    'to--discard'
  )
));

rule('repetition',
  'option', seq(opt('repeat--repeat(repeat)'),  alt('group', 'element'))
);

rule('repeat',
  seq(
    lit('*'), 'to--INT(min,0)',
    alt(more('DIGIT--INT(max)'), 'to--INT(max,1)')
  ),
  seq(
    more('DIGIT--INT(min)'),
    alt(
      seq(
        lit('*'),
        alt(
          more('DIGIT--INT(max)'), 'to--INT(max, -1)'
        )
      ),
      'to--copy(min, max)'
    )
  )
);

rule('element',
  'num-val',
  seq('char-val', 'to--type(string)'),
  seq('action', 'to--type(action)')
);

rule('option', seq(
  lit('['), any('c-wsp'),
  alt(
    seq('element', any('c-wsp'), lit(']')),
    seq(
      'alternation--pending(factor)',
      any('c-wsp'), lit(']'), 'to--type(list)'
    )
  ),
  'to--INT(min,0)'
));

rule('group', seq(
  lit('('), any('c-wsp'),
  'alternation--pending(factor)',
  any('c-wsp'), lit(')'), 'to--type(list)'
));

rule('action', seq(
  'rulename--STRING(refer)',
  opt(
    lit('--'),
    alt(
      seq(
        more('ALPHA--STRING(name)'),
        opt(
          lit('('), any('SP'),
          'argument', any(any('SP'), lit(','), any('SP'), 'argument'),
          any('SP'), lit(')')
        )
      ),
      'to--fault(\'Invalid arguments of %s\', refer)'
    )
  )
));

rule('argument',
  seq(lit('\''), any('quotes-vchar--STRING(factor, unescape)'), lit('\'')),
  'int-val--INT(factor)',
  more('safe-vchar--STRING(factor)'),
  'to--fault(\'Invalid arguments on %s\', refer)'
);

rule('int-val',
  seq(opt(lit('-'), more('DIGIT')))
);

rule('safe-vchar',
  'ALPHA', 'DIGIT', lit('-')
);

rule('char-val',
  seq(lit('\''), more('ex27--STRING(value)'), lit('\'')),
  seq(lit('"'), more('ex22--STRING(value)'), lit('"'), 'to--false(sensitive)')
);

rule('ex22', range(0x20, 0x21), range(0x23, 0x7E));
rule('ex27', range(0x20, 0x26), range(0x28, 0x7E));

rule('num-val', seq(
  lit('%'),
  alt(
    seq(lit('x'), 'hex-val', 'to--type(codes)'),
    seq(lit('b'), 'bin-val', 'to--type(bits)'),
    'to--fault(\'Unsupport num-val formula %q\', -1)'
  )
));

rule('bin-val', seq(
  rep(8, 8, 'BIT--INT(value,2)'), alt(
    seq(lit('-'), rep(8, 8, 'BIT--INT(value,2)'), 'to--true(isRange)'),
    any(lit('.'), rep(8, 8, 'BIT--INT(value,2)'))
  )
));

rule('hex-val', seq(
  more('HEXDIG--RUNE(value,16)'), alt(
    seq(lit('-'), more('HEXDIG--RUNE(value,16)'), 'to--true(isRange)'),
    any(lit('.'), more('HEXDIG--RUNE(value,16)'))
  )
));

rule('ALPHA', range(0x61, 0x7A), range(0x41, 0x5A));

rule('BIT', range(0x30, 0x31));

rule('DIGIT', range(0x30, 0x39));

rule('HEXDIG', 'DIGIT', range(0x41, 0x46));

rule('SP', rune(0x20));

rule('WSP', rune(0x20), rune(0x09));

rule('VCHAR', range(0x21, 0x7E));

module.exports = metadata;
