function error(prefix, item) {
  return prefix + ': ' + JSON.stringify(item);
}

function invalidRune(rune) {
  return rune < 0 || rune > 0x10ffff ||
    rune >= 0xD800 && rune <= 0xDFFF;
}

function repeat(item) {
  if (item.min === 1 && item.max === 1)
    return '';

  if (item.min === item.max)
    return `${item.min}`;

  if (item.max === -1)
    return `${item.min}*`;

  if (item.min === 0)
    return `*${item.max}`;
  return `${item.min}*${item.max}`;
}

function toIndex(item, all, names) {
  let
    form, index;
  switch (item.type) {
    case 'list':
      patternize(item.factor, all, names);
      break;
    case 'action':
      index = {
        type: 'index',
        min: item.min,
        max: item.max,
        refer: 0,
        action: 0
      };

      if (item.refer === 'to') {
        form = JSON.stringify(item.factor || []).slice(1, -1);
        form = `to--${item.name}(${form})`;
      }else {
        index.refer = names.indexOf(item.refer);
        if (index.refer <= 0)
          throw Error(error('Invalid action', item));
        if (!item.name) break;
        form = JSON.stringify(item.factor || []).slice(1, -1);
        form = `refer--${item.name}(${form})`;
      }

      index.action = names.indexOf(form);
      if (index.action === -1) {
        index.action = names.push(form) - 1;
        all.push({
          type: 'action',
          min: 1,
          max: 1,
          refer: item.refer === 'to' && 'to' || 'refer',
          name: item.name,
          factor: item.factor && item.factor.slice() || []
        });
      }
      break;
    case 'codes':
      if (item.value.some(invalidRune) ||
        item.isRange && item.value[0] >= item.value[1])
        throw Error(error('Invalid codes', item));
      break;
    case 'string':
      if (!item.sensitive) {
        form = item.value.toLowerCase();
        if (form === item.value.toUpperCase())
          item.sensitive = true;
        else
          item.value = form;
      }
      break;
    case 'bits':
      if (item.isRange && (
          item.value[0].length !== item.value[1].length ||
          item.value[0] >= item.value[1]
        ))
        throw Error(error('Invalid bits range', item));
      break;
    default:
      throw Error(error('Invalid type', item));
  }
  return index || item;
}

function patternize(list, all, names) {
  let max = list.length;
  for (var i = 0; i < max; i++)
   list[i] = toIndex(list[i], all, names);
}

module.exports = function(formnames, formulas) {
  patternize(formulas, formulas, formnames);
};
