"use strict"

function msg(message, text, loc) {
	if (!loc && !text) return message
	message += ':' + (loc && (loc.line + ':' + loc.col) || '')
	text = JSON.stringify(text)
	return message + (message.length + text.length >= 60 && '\n' || ' ') + text
}

exports.syntaxError = function syntaxError(message, text, loc, fileName) {
	return new SyntaxError(msg(message, text, loc))
}

exports.retrans = function retrans(collector) {
	var instance = collector && (
		typeof collector.retrans == 'function' && collector ||
		typeof collector == 'function' && collector.prototype &&
		typeof collector.prototype.retrans == 'function' &&
		new collector()) || null

	if (!instance)
		throw new Error(
			'The object does not implement Retrans: ' + JSON.stringify(collector))
	return instance
}