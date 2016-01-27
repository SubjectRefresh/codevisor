var github = require('octonode');
var fs = require('fs');

var owner = "subjectrefresh";
var repo  = "codevisor";
var tree  = "39c9079077f8471f87204953c636bf82b98acd34";
var client = github.client();

function getData(owner, repo, tree, callback) {
	var ghrepo = client.repo(owner + "/" + repo);
	ghrepo.tree(tree, true, function(error, json) {
		fs.writeFile("./data/" + tree, JSON.stringify(json), function(err) {
		    if(err) {
		        return console.log(err);
		    }
		    console.log(tree + " updated.");
		    callback();
		}); 
	});
}

function decodeFile(tree) {
	fs.readFile("./data/" + tree, 'utf8', function (err, data) {
	    if (err) throw err;
	    var obj = JSON.parse(data);
	    console.log("Object Decoded.");
	    jsonToTree(obj);
	});
}

function onReceive() {
	decodeFile(tree);
}

function jsonToTree(json) {
	console.log("Tree Conversion Started.");
	var tree = {tree: {}};
	var temptree = []
	var longest = 0;
	for (i=0; i<json.tree.length; i++) {
		var path = json.tree[i].path.split("/");
		if (path[path.length-1].indexOf('.') > -1) {
			if (path.length > longest) {
				longest = path.length;

			}
			temptree.push(path);
		}
	}
	for (j=0; j<longest; j++) {
		for (i=0; i<temptree.length; i++) {
			// console.log(temptree[i][j]);
			if (temptree[i][j] != undefined) {
				path = ["['tree']"]
				for (k=0; k <= j; k++) {
					path.push("['" + temptree[i][k] + "']")
				}
				path = path.join([separator = ''])
				// console.log(path);
				eval("tree" + path + " = {}")
			}
		}
	}

	for (i=0; i<temptree.length; i++) {
		path = ".tree"
		for (j=0; j < (temptree[i].length); j++) {
			path += "." + temptree[i][j];
		}
		console.log(path);
	}

	// console.log(JSON.stringify(temptree));
	console.log(JSON.stringify(tree));
}

fs.stat('./data/' + tree, function(err, stat) {
    if(err == null) {
        console.log('File exists, using cached version.');
        onReceive();
    } else if(err.code == 'ENOENT') {
        getData(owner, repo, tree, onReceive);
    } else {
        throw err;
    }
});