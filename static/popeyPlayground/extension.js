var fs = require('fs');

var colours = JSON.parse(fs.readFileSync('colours.json', 'utf8'));

function ext(ext) {
	// Turn extension to colour
	var keys = Object.keys(colours);
	for (i=0; i<keys.length; i++) {
		var extensions = colours[keys[i]].extensions;
		try {
			for (j=0; j<extensions.length; j++) {
				if (extensions[j] == ext) {
					if (colours[keys[i]].color != undefined) {
						return colours[keys[i]].color;
					} else {
						return null;
					}
				}
			}
		} catch(err) {
			// Nothing
		}
	}
	return null;
}

function get(lang) {
	// Turn language to colour
	return colours[lang].color;
}

function lang(ext) {
	// Turn extension to language
	var keys = Object.keys(colours);
	for (i=0; i<keys.length; i++) {
		var extensions = colours[keys[i]].extensions;
		try {
			for (j=0; j<extensions.length; j++) {
				if (extensions[j] == ext) {
					return keys[i];
				}
			}
		} catch(err) {
			// Nothing
		}
	}
	return null;
}

console.log("== Testing ext() with '.agda' (Should Be #315665) ==");
console.log(ext(".agda"));
console.log("== Testing get() with 'Agda' (Should Be #315665) ==");
console.log(get("Agda"));
console.log("== Testing lang() with '.agda' (Should Be Agda) ==");
console.log(lang(".agda"));