/**
To build the first coder.js

let g=require('./grammar');
require('./patternize')(g.formnames,g.formulas);
require('fs').writeFileSync('./coder.js', require('./js-coder')(g));
*/
let meta = {
  mode: 'string',
  typefield: 'type',
  locfield:  'loc',
  crlf: '',
  indent: '',
  infix: null,
  nullable: null,
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

type('meta', 'struct', null , {
  mode:     field('string', null, 'string'),
  typefield: field('string', null, 'type'),
  locfield:  field('string', null, 'loc'),
  crlf:      field('string'),
  indent:    field('string'),
  infix:     field('', ['infix']),
  nullable:  field('unique', ['STRING']),
  custom:    field('object', ['BOOL', 'STRING','stringList']),
  typenames: field('unique', ['STRING']),
  types:     field('array',  ['type']),
  formnames: field('unique', ['STRING']),
  formulas:  field('array',
    ['list','action','string','codes','bits','index']
  ),
  comments:  field('array', ['comment'])
});

type('stringList' , 'ARRAY', ['STRING']);

type('type', 'struct', null , {
  kind:       field('string'),
  fields:     field('object', ['field']),
  annotation: field('array',  ['STRING','INT'])
});
type('field', 'struct', null , {
  kind:      field('string'),
  value:     field('', ['INT','STRING','BOOL']),
  annotation: field('array', ['STRING','INT'])
});
type('infix', 'struct' , null, {
  node:     field('string'),
  left:     field('string'),
  operator: field('string'),
  right:    field('string'),
  priority: field('array', ['stringList'])
});
type('repeat', 'struct', null, {
  min:  field('int', null, 1),
  max:  field('int', null, 1)
});
type('list', 'struct', null, {
  repeat: field('mixins'),
  choice: field('bool', null, false),
  factor: field('array',
    ['list','action','string','codes','bits','index']
  )
});
type('codes', 'struct', null, {
  repeat: field('mixins'),
  value:   field('array', ['RUNE']),
  isRange: field('bool', null, false)
});
type('bits', 'struct' , null, {
  repeat: field('mixins'),
  value:   field('string'),
});
type('string', 'struct' , null, {
  repeat: field('mixins'),
  value: field('string'),
  sensitive: field('bool', null, true)
});
type('action', 'struct', null, {
  repeat: field('mixins'),
  refer:  field('string'),
  name:   field('string'),
  factor: field('array', ['STRING', 'INT', 'FLOAT'])
});
type('index', 'struct', null, {
  repeat: field('mixins'),
  refer:  field('int', null, 0),
  action: field('int', null, 0)
});
type('comment', 'struct', null, {
  value: field('string')
});

function type(name, kind, annotation, fields) {
  meta.typenames.push(name);
  meta.types.push({kind, fields, annotation});
}

function field(kind, anno, value) {
  if(kind!=='mixins') kind = kind.toUpperCase();
  return {kind, value: value===undefined?'':value, annotation: anno || null};
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

  meta.formnames.push(name);
  meta.formulas.push(reduce(factor));
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

rule('result', 'grammar--meta');

rule('grammar', seq(
  any('c-nl'), lit('ABNF-Actions'), 'defined-as', 'meta', any(more('c-wsp'), 'meta'),
  more(any('WSP'), 'c-nl'), 'rulelist',
  any(alt('WSP', 'comment--comment(/comments)', 'to--eol'))
));

rule('meta',
  seq(lit('to-'), alt(
    seq(
      lit('mode'), more('WSP'), alt(
        'modes--STRING(mode)',
        'to--fault(\'Unsupported %s mode\')'
      )
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
      lit('\''), any('ALPHA--STRING(locfield)'), lit('\'')
    ),
    seq(
      lit('nullable'), more('WSP'),
      lit('<'), 'nullable--UNIQUE(nullable)', lit('>')
    ),
    seq(
      lit('typefield'), more('WSP'),
      lit('\''), any('ALPHA--STRING(typefield)'), lit('\'')
    ),
    seq(
      lit('infix'), more('WSP'), 'infix--infix(infix)'
    ),
    'custom--OBJECT(custom)',
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

rule('modes', lit('string'),lit('byte'),lit('bits'));

rule('nullable', seq(
  'rulename--STRING',
  any(
    lit(','), opt('SP'), 'rulename--STRING'
  )
));

rule('custom', seq(
  'rulename--STRING(key)', more('WSP'),
  alt(

    seq(lit('true'),'to--true(val)'),
    seq(lit('false'),'to--false(val)'),
    'string',
    seq(
      lit('['), any('WSP'), 'strings--stringList(val)', any('WSP'), lit(']')
    ),
    'to--fault(\'Invalid custom configuration %q\', key)'
  )
));

rule('or', seq(more('c-wsp'), lit('/'), more('c-wsp')));

rule('strings', seq(
  'string', any('or', 'string')
));

rule('string', seq(
  lit('\''), any('quotes-vchar--STRING(val, unescape)'), lit('\'')
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
    lit('node'),     more('WSP'), lit('\''), 'rulename--STRING(node)',    lit('\''), more('c-wsp'),
    lit('left'),     more('WSP'), lit('\''), more('ALPHA--STRING(left)'),    lit('\''), more('c-wsp'),
    lit('operator'), more('WSP'), lit('\''), more('ALPHA--STRING(operator)'), lit('\''), more('c-wsp'),
    lit('right'),    more('WSP'), lit('\''), more('ALPHA--STRING(right)'),   lit('\''), more('c-wsp'),
    lit('priority'), more('WSP'), lit('['), any('c-wsp'), 'priority--ARRAY(priority)', any('c-wsp'), lit(']'),
  'c-wsp', lit(')')
));

rule('priority', seq(
  'infixes--stringList', any(more('c-wsp'), 'infixes--stringList')
));

rule('infixes', seq(
  lit('['), any('c-wsp'), 'strings', any('c-wsp'), lit(']')
));

rule('type-declare',
  seq(
    lit('('),
    more(more('c-wsp'), 'field-declare--OBJECT(fields)'),
    more('c-wsp'), lit(')'), 'to--STRING(kind, struct)'
  ),
  'type-annotation'
);

rule('field-declare', seq(
  'rulename--STRING(key)', more('WSP'), alt(
    'field-annotation--field(val)',
    'to--fault(\'Invalid type-annotation: %s\', key)'
  )
));

rule('type-annotation',
  seq('type-kinds--STRING(kind)', 'annotation--ARRAY(annotation)'),
  'annotation--ARRAY(annotation)'
);

rule('field-annotation',
  seq(
    lit('%d'), more('DIGIT--INT(value)'), 'to--STRING(kind, INT)'
  ),
  seq(
    lit('\''),
    any('quotes-vchar--STRING(value,unescape)'),
    lit('\''),                               'to--STRING(kind, STRING)'
  ),
  seq(lit('true'), 'to--true(value)',        'to--STRING(kind, BOOL)'),
  seq(lit('false'), 'to--false(value)',      'to--STRING(kind, BOOL)'),
  'mixins--STRING(kind)',
  'type-annotation'
);

rule('type-kinds',
  'field-kinds', lit('interface')
);

rule('field-kinds',
  lit('ARRAY'), lit('UNIQUE'), lit('OBJECT')
);

rule('mixins', lit('mixins'));

rule('annotation', seq(
  lit('<'),
    'rulename--STRING',
    any(lit(','), opt('SP'), 'rulename--STRING'),
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
  lit(';'), any('comment-val--STRING(value)')
));
rule('comment-val', 'WSP', 'VCHAR');

rule('rulelist', seq(
  'rule', any(any('WSP'), 'c-nl', opt('rule'))
));

rule('rule', seq(
  'rulename--STRING(formnames)', 'defined-as',
  'alternation--pending(formulas)'
));

rule('alternation', seq(
  'concatenation--pending(factor)',
  alt(
    seq(
      more('or', 'concatenation--pending(factor)'),
      'to--true(choice)', 'to--type(list)'
    ),
    'to--discard'
  )
));

rule('concatenation', seq(
  'repetition--pending(factor)',
  alt(
    seq(
      more(more('c-wsp'), 'repetition--pending(factor)'),
      'to--type(list)'
    ),
    'to--discard'
  )
));

rule('repetition',
  'option',
  seq(
    opt('repeat'),
    alt('group', 'element')
  )
);

rule('repeat',
  seq(
    lit('*'), 'to--INT(min,0)',
    alt(more('DIGIT--INT(max)'), 'to--INT(max, -1)')
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
  'number-val--pending(factor)',
  more('safe-vchar--STRING(factor)'),
  'to--fault(\'Invalid arguments on %s\', refer)'
);

rule('number-val', seq(
  opt(lit('-')), more('DIGIT'),
  alt(
    seq(
      lit('.'), more('DIGIT'), 'to--type(FLOAT)'
    ),
    'to--type(INT)'
  )
));

rule('safe-vchar',
  'ALPHA', 'DIGIT',
  lit('-'),lit('/'),lit('?'),lit('+'),lit('!')
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
    seq(lit('b'), rep(1, 53, 'BIT--STRING(value)'), 'to--type(bits)'),
    'to--fault(\'Unsupport num-val formula %q\', -1)'
  )
));

rule('hex-val', seq(
  more('HEXDIG--RUNE(value,\'16\')'), alt(
    seq(lit('-'), more('HEXDIG--RUNE(value,\'16\')'), 'to--true(isRange)'),
    any(lit('.'), more('HEXDIG--RUNE(value,\'16\')'))
  )
));

rule('ALPHA', range(0x61, 0x7A), range(0x41, 0x5A));

rule('BIT', range(0x30, 0x31));

rule('DIGIT', range(0x30, 0x39));

rule('HEXDIG', 'DIGIT', range(0x41, 0x46));

rule('SP', rune(0x20));

rule('WSP', rune(0x20), rune(0x09));

rule('VCHAR', range(0x21, 0x7E));

module.exports = meta;
