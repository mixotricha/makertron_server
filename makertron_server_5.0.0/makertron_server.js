// ==========================================================
// MAKERTRON Procedural Cad System Server Module 
// Damien V Towning 
// 2015

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL Alexandru Marasteanu BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
// 
// ==========================================================

var makertron_server = (function () {

	"use strict";   
	/*global makertron_server,require,console,__dirname,Buffer*/
	/*jshint -W069 */ 

  // ===========================================================
  // logging 
  // ===========================================================
	var log = require('simple-node-logger').createSimpleLogger('project.log');
	 

	var debug = require('debug')
	var https = require('https');
	var request = require("request");
	//var Promise = require("bluebird");
	//var sprintf = require('sprintf').sprintf;
	var fs = require('file-system');

	var EventEmitter = require("events").EventEmitter;
	var cradle = require('cradle');
	var net = require('net');

	var Worker = require('tiny-worker')

  var cpath = function( fullpath ) { var path = fullpath.split('/'); var cwd = path.slice(0,path.length-1); cwd = cwd.join('/')+'/'; return cwd; }
  var PATH = cpath(process.argv[1]);

  // Load in the config
  var config = JSON.parse(fs.readFileSync(PATH+'config.jsn', 'utf8'));
  //var userobject = JSON.parse(fs.readFileSync(PATH+'default_user.jsn', 'utf8'));

	var VERSION = config.version; 
	var PORT = config.port; 
	var DBPORT = config.dbport;
	var DBHOST = config.dbhost; 
	var DBUNAME = config.dbuname;
	var DBPASS =  config.dbpass;	
	var _DEBUG_ = config.debug; 
	var _STANDARD_ = config.standard;	
	var PRINTHOST = config.printhost;
	var PRINTHOSTPORT = config.printhostport; 
	var PRINTHOSTPATH = config.printpath;
	//var OPENSCADHOST = config.openscadhost;
	//var OPENSCADPORT = config.openscadport; 
	var OPENSCADHOSTS = config.openscadhosts; 
	
  log.info( "Makertron Starting Version:" + config.version );
  log.info( "Path:" , PATH );
	
  // ===========================================================
	// handy little helpers for string replace and for chunking 
	// ===========================================================
	String.prototype.replaceAll = function(search, replacement) {
		var target = this;
		return target.replace(new RegExp(search, 'g'), replacement);
	};

	Array.prototype.chunk = function(groupsize){
    var sets = [], chunks, i = 0;
    chunks = this.length / groupsize;
    while(i < chunks){
			sets[i] = this.splice(0,groupsize);
			i++;
    }
    return sets;
	};
	
	// --------------------------------------------------------
	// Generate a hashed string
	// --------------------------------------------------------
	var makeId = function() {
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for( var i=0; i < 5; i++ )
		text += possible.charAt(Math.floor(Math.random() * possible.length));
		return text;
	};

	
	// ===========================================
	// Get current time 
	// ===========================================
	var get_time = function() { 
		var currentdate = new Date(); 
		var datetime = currentdate.getDate() + "/"
                + (currentdate.getMonth()+1)  + "/" 
                + currentdate.getFullYear() + " @ "  
                + currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();
		return datetime; 
	}
		
	var worker = new Worker(function(){

		var lodash = require('lodash') 
		var ref = require("ref");
		var ArrayType = require('ref-array');
		var StructType = require('ref-struct');
		var ffi = require("ffi");
		var ffi = require("ffi");
		var debug = require("debug") 
		var fs = require("file-system") 

		// ===================================================
		// Build and execute the resulting javascript 
		// ===================================================
		this.process_scad = function(result) { 

			var Out 

			//try {  
				Out = Function(result) 
			//}
			//catch(e) {   
			//	Out = Function("this.foo = function(){this.logger('An error in syntax: '+e);}") 
			//}

			var out = new Out()

			out.stack = [[0]] 
			out.final_stack = [] 
			out.stack_index = 0 
			out.actions_stack = [] 
			out.actions_stack_index = 0 
			out.operations = [] 
			
			// conversion and truncation 
			out.deg2rad = function(deg) { return deg * (Math.PI/180) }
			out.rad2deg = function(rad) { return (rad * 180)/Math.PI } 
			out.truncate = function(num, places) { return num }

			// trig functions
			out.cos =   function( rad   ) {  return this.truncate(Math.cos(this.deg2rad(rad)),4) }
			out.sin =   function( rad   ) {  return this.truncate(Math.sin(this.deg2rad(rad)),4) }
			out.atan2 = function( a , b ) {  return this.truncate(Math.atan2(a,b),4) } 
			out.pow   = function( a , b ) {  return this.truncate(Math.pow(a,b),4)   }
			out.sqrt  = function( a     ) {  return this.truncate(Math.sqrt(a),4)    } 
			out.max   = function( a , b ) {  return this.truncate(Math.max(a,b),4)   } 
			out.min   = function( a , b ) {  return this.truncate(Math.min(a,b),4)   } 
		
			// Brep implementation of primitives and actions 

			// =======================================================
			// Openscad radius convention 
			// Note that openscads calling convention for various prims
			// is a bit of a mess and a bit ambiguous but we want our 
			// code to follow it as close as we can. This is transposed
			// from the c++ code in OpenScad 
			// ========================================================
			out.lookup_radius = function( diameter_var, radius_var) {
				if ( isNaN(diameter_var) === false ) {
					if (isNaN(radius_var) === false ) {
						this.logger("WARNING: Ignoring radius variable " , radius_var , " as diameter ", diameter_var , " is defined too.")
					}
					return diameter_var / 2.0
				} else if ( isNaN(radius_var) === false ) {			
					return radius_var;
				} else {
					return undefined;
				}
			}
			// =================================================================
			// Openscad translate
			// =================================================================
			out.create_translate = function() { 
				this.logger("Translate: ",arguments[0])
				var x   = parseFloat(arguments[0]['vector'][0]) 
				var y   = parseFloat(arguments[0]['vector'][1]) 
				var z   = parseFloat(arguments[0]['vector'][2]) 
				var obj = arguments[0]['obj']
				var result = this.brep_lib.translate( x , y , z , obj ) 
				return result
			}

			// ==================================================================
			// Openscad Rotate 
			// ==================================================================
			out.create_rotate = function() { 
				this.logger("Rotate: ",arguments[0])
				var r = Math.PI / 180
				var x_rotate   = parseFloat(arguments[0]['vector'][0]) * r 
				var y_rotate   = parseFloat(arguments[0]['vector'][1]) * r 
				var z_rotate   = parseFloat(arguments[0]['vector'][2]) * r
				var obj        = arguments[0]['obj']
				var result = this.brep_lib.rotateX( x_rotate , obj    )
						result = this.brep_lib.rotateY( y_rotate , result )
						result = this.brep_lib.rotateZ( z_rotate , result )
				return result
			}

			// Perform linear extrude 
			out.create_linear_extrude = function() {
				this.logger("Linear Extrude: ", arguments[0]) 
				var object = arguments[0]['object'] 
				var height = arguments[0]['height'] 
				return this.brep_lib.extrude(height,object); 
			}

			// =====================================================
			// Openscad Sphere 
			// =====================================================
			out.create_sphere = function() { 
				this.logger("Sphere: ",arguments[0])
				var r = 0		
				r = this.lookup_radius( parseFloat(arguments[0]['d']) , parseFloat(arguments[0]['r']) ) 
				if ( r === 0 || r === undefined ) { 
					r = 1  
				}
				var obj = this.brep_lib.sphere(r,0.0,0.0,0.0)	 	
				return obj 
			} 

			// ===============================================================
			// Openscad Cube 
			// ===============================================================
			out.create_cube = function() {
				this.logger("Cube",arguments[0])
				var x = 0
				var y = 0 
				var z = 0
				var xs = 1 
				var ys = 1 
				var zs = 1 
				var center = false 

				//if ( arguments[0]['size'] === undefined && arguments[0]['vector'] === undefined ) { 
				//	if ( typeof(arguments[0]) === "number" ) {
						  console.log( arguments )  
				//	}
				//	else { 
				//		this.logger("Cube has no specificed size. Defaulting to unit cube.") 
				//	}
				//}
				
				if ( arguments[0]['vector'] !== undefined ) { arguments[0]['size'] = arguments[0]['vector'] }
				
				if ( typeof(arguments[0]['size']) === "number" ) { 
					xs = parseFloat(arguments[0]['size'])
				 	ys = parseFloat(arguments[0]['size'])
					zs = parseFloat(arguments[0]['size'])
				}
				if ( typeof(arguments[0]['size']) === "object" ) {
					xs = parseFloat(arguments[0]['size'][0])
					ys = parseFloat(arguments[0]['size'][1])
					zs = parseFloat(arguments[0]['size'][2])
				}
				if ( typeof(arguments[0]['center']) === "boolean" ) {
					center = arguments[0]['center']
				}
				if ( center === true ) { 
					x = -(xs / 2)
					y = -(ys / 2) 
					z = -(zs / 2) 
				}			
				var obj = this.brep_lib.box(x,y,z,xs,ys,zs)	

				return obj 
		
			} 

			// ===============================================================
			// Openscad Cylinder 
			// ===============================================================
			out.create_cylinder = function cylinder() { 
				this.logger("Cylinder")  
				var obj
				var r1 = 1 
				var r2 = 1 
				var h  = 1
				var y = 0 
				var center = false 
				if ( arguments[0]['r'] !== undefined ) { 
					arguments[0]['r1'] = arguments[0]['r'] 
				} 
				if ( arguments[0]['r1'] === undefined ) { 
					this.logger("No default radius") 
					return false 
				} 
				if ( arguments[0]['r2'] === undefined ) { 
					arguments[0]['r2'] = arguments[0]['r1']  
				} 
				if ( typeof(arguments[0]['r1']) === "number"      ) { r1 = parseFloat(arguments[0]['r1'])         }
				if ( typeof(arguments[0]['r2']) === "number"      ) { r2 = parseFloat(arguments[0]['r2'])         }
				if ( typeof(arguments[0]['h'] ) === "number"      ) { h =  parseFloat(arguments[0]['h'] )         }
				if ( typeof(arguments[0]['center']) === "boolean" ) { center =        arguments[0]['center']      }
				if ( center === true                              ) { y = -(h / 2)                                }			
				if ( r1 !== r2 ) { 
					obj = this.brep_lib.cone(r1,r2,h,y)
				}
				else { 
				 obj = this.brep_lib.cylinder(r1,h,y) 
				}
				return obj  
			} 

			// ===================================================================
			// Create a polyhedron openscad 
			// ===================================================================
			out.create_polyhedron = function() {

				var i = 0
				var ii = 0
				var faces = [] 
				var points = []
		
				if ( arguments[0]['triangles'] !== undefined ) {
					this.logger("DEPRECATED: polyhedron(triangles=[]) will be removed in future releases. Use polyhedron(faces=[]) instead.") 
					arguments[0]['faces'] = arguments[0]['triangles']
	 			}

				if ( arguments[0]['points'] === undefined ) { 
					this.logger("WARNING: PolySet has degenerate polygons")
					return false 
				}

				// This sort of ambiguous behaviour in openscad bothers me deeply. If it doesn't exist -fail- don't be inventing things ...  		
				if ( arguments[0]['points'].length === 0 ) { 
					arguments[0]['points'] = [[0,0,0]] 
				}

				// Really want a sanity check that makes sure that indexes in to point space actually return relevent points not just this 
				// trusting this create and fail principle. 
				var face_set = arguments[0]['faces'].reverse() // reverse the face winding to be compatible with booleans 
				var point_set = arguments[0]['points']  
	 			
				// var convexity = arguments[0]['convexity'] // disregarding convexity for now 
				// generate face lets with length as first index ( overhead but bit less work to get sizes in the c++ ) 
				var face_set_length = face_set.length
				for ( i = 0; i < face_set_length; i++ ) { 
					var face = [] 
					var f_length = face_set[i].length
					face.push( f_length+1 )  
					for ( ii = 0; ii < f_length; ii++ ) { 
						face.push( face_set[i][ii] )
					}		
					faces.push( face ) 
				}
				// Openscad if a component of the point is missing just adds it ... 
				for ( i in point_set ) { 
					if ( point_set[i][0] !== undefined ) { points.push( point_set[i][0] ) } else { points.push(0.0) }
					if ( point_set[i][1] !== undefined ) { points.push( point_set[i][1] ) } else { points.push(0.0) }
					if ( point_set[i][2] !== undefined ) { points.push( point_set[i][2] ) } else { points.push(0.0) }
				}
			
				return this.brep_lib.polyhedron(faces,points,faces.length)
			}

			// ===================================================================
			// Create a polgon openscad 
			// ===================================================================
			out.create_polygon = function() {
				this.logger("Polygon") 
				var i = 0
				var paths  = arguments[0]['paths'] 
				var points = arguments[0]['points'] 
				var a,b,c,d
				for ( i = 0; i < points.length; i++ ) { points[i].push(0) } // add our z 
				if ( paths.length !== 1 ) { // if we contain multiple polys need a boolean iteration
					for ( i = 0; i < paths.length-1; i++ ) { 
						if ( i === 0 ) a = this.create_polyhedron({ faces:[paths[i]] , points:points } )
						b = this.create_polyhedron({ faces:[paths[i+1]] , points:points } )
						c = this.create_union( {a:a , b:b} ) 
						d = this.create_intersection( {a:a , b:b} ) 
						a = this.create_difference(   {a:c , b:d} ) 
					}
				}		
				else { // just return the single poly 
					// We close loops ourselves so we check to see if this is a closed shape. 
					// Really it must always be a closed shape ? ... 
					if ( paths[0][0] === paths[0][paths[0].length-1] ) { 
						paths[0] = paths[0].slice( 0 , paths[0].length-1 )  
					} 
					a = this.create_polyhedron({ faces:[paths[0]] , points:points } )
				}
				arguments[0]['obj'] = a
				a = this.perform_actions(arguments[0]) 
				return a
			}

			// ===================================================================
			// Create a circle 
			// ===================================================================
			out.create_circle = function() { 
				this.logger("Circle")
				var radius = arguments[0]['radius']
		 		var obj = this.brep_lib.circle(radius); 
				arguments[0]['obj'] = obj 
				obj = this.perform_actions(arguments[0]) 
				return obj 
			}

			// Boolean union
			out.create_union = function() { 
				this.logger("Union")
				var children = arguments[0]['children']  
				var obj = children[0]
		 		for ( var i =1; i < children.length; i++ ) {
					var obj = this.brep_lib.uni( obj , children[i] ) 
				}
				return obj 
			}

			// Boolean difference
			out.create_difference = function() { 
				this.logger("Difference")
				var children = arguments[0]['children'] 
				var obj = children[0]
		 		for ( var i =1; i < children.length; i++ ) {
					var obj = this.brep_lib.difference( obj , children[i] ) 
				}
				return obj  
			}

			// Boolean intersection 
			out.create_intersection = function() { 
				this.logger("Intersection")
				var children = arguments[0]['children'] 
				var obj = children[0]
		 		for ( var i =1; i < children.length; i++ ) {
					var obj = this.brep_lib.intersection( obj , children[i] ) 
				}
				return obj  
			}
	

			// booleans
		 	
			out.stack = [] 
			out.stack_index = 0 
			out.quality = 0.1

			// --------------------------------------------------------
			// Generate a hashed string
			// --------------------------------------------------------
			out.makeId = function() {
				var text = "";
				var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
				for( var i=0; i < 5; i++ )
				text += possible.charAt(Math.floor(Math.random() * possible.length));
				return text;
			}

			out.stack_increment = function() { 
				this.stack_index++
				this.stack.push([]) 
			}

			out.stack_decrement = function(count) {
				 this.stack_index-=count
			}

			out.get_parent = function() {
				var parent = "root"
				var id = "root"
				if ( this.stack[this.stack_index-1] !== undefined ) {
					parent =  this.stack[this.stack_index-1][this.stack[this.stack_index-1].length-1]['operation']  
					id =  this.stack[this.stack_index-1][this.stack[this.stack_index-1].length-1]['id']  
				}
				return { parent: parent , id : id } 
			}

			out.union = function() {  	
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 		
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'] , 
																						operation:"union" , 
																						id: this.makeId() , 
																						objects:[],
																						done: false 
																					})   
				this.stack_increment()
			}

			out.intersection = function() {  	
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 		
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'] , 
																						operation:"intersection" , 
																						id: this.makeId() , 
																						objects:[],
																						done: false 
																					})   
				this.stack_increment()
			}

			out.difference = function() {  		
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 		
				this.stack[this.stack_index].push({
																						parent: p['parent'] , 
																						parent_id: p['id'] , 
																						operation:"difference" , 
																						id: this.makeId() , 
																						objects: [] ,
																						done: false 
																					})   
				this.stack_increment()
			}

			out.union_end = function() {
				this.stack_decrement(1)	
			}
			out.intersection_end = function() {
				this.stack_decrement(1)	
			}
			out.difference_end = function() {
				this.stack_decrement(1)
			}
			out.end = function() {
				this.stack_decrement(1)
			}

			out.polygon = function() { 
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'], 
																						operation: "polygon" , 
																						objects: [this.create_polygon(arguments[0])] ,
																						done: true
																				 })      
			}

			out.polyhedron = function() { 
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'], 
																						operation: "polyhedron" , 
																						objects: [this.create_polyhedron(arguments[0])] ,
																						done: true
																				 })
					    
			}

			out.cube = function() { 		
				console.log("cuuube!") 
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ 
																						parent: p['parent'] , 
																						parent_id: p['id'], 
																						operation: "cube" , 
																						objects: [this.create_cube(arguments[0])],
																						done: true 
																					})  	  
			}

			out.sphere = function() { 
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'], 
																						operation: "sphere" , 
																						objects: [this.create_sphere(arguments[0])] ,
																						done: true
																				 })      
			}

			out.cylinder= function() { 
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'],  
																						operation: "cylinder" , 
																						objects: [this.create_cylinder(arguments[0])] ,
																						done: true 
																					})   
			}

			out.translate = function() { 
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'], 
																						operation: "translate" , 
																						arguments: arguments[0], 
																						id: this.makeId() ,
																						objects: [] , 
																						done: false 
																					})
		 
				this.stack_increment()
			}

			out.rotate = function() {
				var p = this.get_parent() 
				if ( this.stack[this.stack_index] === undefined ) this.stack[this.stack_index] = [] 
				this.stack[this.stack_index].push({ parent: p['parent'] , 
																						parent_id: p['id'], 
																						operation: "rotate" , 
																						arguments: arguments[0], 
																						id: this.makeId() ,
																						objects: [] , 
																						done: false 
																					})  
				this.stack_increment()
			}

			// ------------------------------------------------------------
			// Check all of a nodes children to see if they are complete and
			// collect together all resultant prims  
			// ------------------------------------------------------------
			out.children_complete = function( operation , id ) { 
				var i,ii,objects = [] , state = true  
				for ( i = 0; i < this.stack.length; i++ ) { 
					for ( ii = 0; ii < this.stack[i].length; ii++ ) { 
						if ( operation === this.stack[i][ii]['parent'] && id === this.stack[i][ii]['parent_id'] ) { 
							if ( this.stack[i][ii]['done'] === false ) {
								state = false
							}
							else {
								objects.push( this.stack[i][ii]['objects'] )
							}
						}
					}
				}
				if ( state === false ) { 
					return false 
				} else {
					return lodash.flatten(objects)
				}
			}

			// -------------------------------------------------------------
			// Walk and keep walking until no more incomplete nodes are left
			// Brute force style. Eventually we will hit every node. 
			// -------------------------------------------------------------
			out.walk = function() {  
				var i,ii,iii
				for ( i = 0; i < this.stack.length; i++ ) { 
					for ( ii = 0; ii < this.stack[i].length; ii++ ) {
						if ( this.stack[i][ii]['done'] === false ) {  
							var objects = this.children_complete( this.stack[i][ii]['operation'] , this.stack[i][ii]['id'] ) 
							if ( objects !== false ) { 
								if ( this.stack[i][ii]['operation'] === "translate" ) {  
									for ( iii = 0; iii < objects.length; iii++ ) {
										this.stack[i][ii]['arguments']['obj'] = objects[iii] 		 
										objects[iii] = this.create_translate( this.stack[i][ii]['arguments'] ) 
										this.stack[i][ii]['arguments']['obj'] = [] 
									}
									this.stack[i][ii]['objects'] = ( objects )  
									this.stack[i][ii]['done'] = true 	
									out.walk()
								}
								if ( this.stack[i][ii]['operation'] === "rotate" ) {  
									for ( iii = 0; iii < objects.length; iii++ ) {
										this.stack[i][ii]['arguments']['obj'] = objects[iii] 		 
										objects[iii] = this.create_rotate( this.stack[i][ii]['arguments'] ) 
										this.stack[i][ii]['arguments']['obj'] = [] 
									}
									this.stack[i][ii]['objects'] =  objects   
									this.stack[i][ii]['done'] = true 	
									out.walk()
								}
								if ( this.stack[i][ii]['operation'] === "union" ) { 	
									objects = lodash.flatten(objects) 
									this.stack[i][ii]['objects'].push( this.create_union({children:objects}) )   
									this.stack[i][ii]['done'] = true
									out.walk() 	
								}
								if ( this.stack[i][ii]['operation'] === "intersection" ) { 	
									objects = lodash.flatten(objects) 
									this.stack[i][ii]['objects'].push( this.create_intersection({children:objects}) )   
									this.stack[i][ii]['done'] = true
									out.walk() 	
								}

								if ( this.stack[i][ii]['operation'] === "difference" ) { 	
								objects = lodash.flatten(objects) 
									this.stack[i][ii]['objects'].push( this.create_difference({children:objects}) )   
									this.stack[i][ii]['done'] = true
									out.walk() 	
								}
							}
						} 
					}
				}
			}

			// defaults for arguments for functions  
			out.default = function(a,b) { if ( a === undefined ) { return b } return a }

			// console output 
			out.echo = function() {
				var str = "" 
				for ( var i = 0; i < arguments.length; i++ ) { 
					str += arguments[i] 
				}
				//this.logger(str) 
			}	

			// send log results to client 	
			out.logger = function() { 
				postMessage({ type: "log" , data: JSON.stringify(arguments) })
			}

			// send log results to client 	
			out.error = function() { 
				postMessage({ type: "error" , data: JSON.stringify(arguments) })
			}

			// output result 
			out.run = function() { 		
				var objects = [] 
				//try {
					for ( var i = 0; i < out.stack.length; i++ ) {
						for ( var ii = 0; ii < out.stack[i].length; ii++ ) { 
							if  ( out.stack[i][ii]['parent'] === "root" ) { 
								for ( var iii = 0; iii < out.stack[i][ii]['objects'].length; iii++ ) { 
									objects.push(this.brep_lib.convert_brep_tostring(out.stack[i][ii]['objects'][iii],this.quality)) 
								} 
							}
						}  
					}
					return objects
				//}
				//catch(e) { 
				//	this.logger("Failed to generate result",e)
				//	return false
				//}
				 
			}

			// ============================================================
			// call our brep library 
			// ============================================================
				//try { 
					debug('Loading the brep.so')
					var brep_path = '' 
					if (fs.existsSync('./brep.so')) {
    				brep_path = './brep.so' 
					}
					else { 		
						brep_path = '/usr/src/app/brep.so'
					}
		
					out.brep_lib = ffi.Library(brep_path, { 
										"box":["string",["float","float","float","float","float","float"]],
										"sphere":["string",["float","float","float","float"]],
										"cone":["string",["float","float","float","float"]],
										"polyhedron":["string",[ArrayType(ArrayType('int')),ArrayType('float'),'int']],
										"difference":["string",["string","string"]],
										"uni":["string",["string","string"]],
										"intersection":["string",["string","string"]],
										"convert_brep_tostring":["string",["string","float"]],
										"translate":["string",["float","float","float","string"]],
										"rotateX":["string",["float","string"]],
										"rotateY":["string",["float","string"]],
										"rotateZ":["string",["float","string"]],
										"circle":["string",["float"]],
										"extrude":["string",["float","string"]],
										"cylinder":["string",["float","float","float"]]
									}) 
				//} catch(e) { 
				//	out.error(e) 
				//	exit(); 
			//	}
									 

				out.foo() 
				out.walk()  		
				postMessage( { type:"object" , data: out.run() })	
		}

	
	  this.onmessage = function(event) { 
		  this.process_scad( event['data'] )   
  	  //self.close();
  	}

	});

	var app = require('express')();
	var http = require('http').Server(app);

	var io = require('socket.io')(http);

	
	app.get('/', function(req, res){
	 res.send("Makertron server version "+ VERSION + "\n"); 
	});

	//io.set('heartbeat interval', 5000);
	//io.set('heartbeat timeout', 1100000);

	io.on('connection', function(socket){
		debug('Getting connection')
		// Parse an openscad object
		socket.on('OPENSCAD',function(data){
			debug('Processing client request') 
			if ( data!==false) {
				worker.onmessage = function(event) {
					var dat = event['data'] 
					if ( dat['type'] === "log"    ) { socket.emit('OPENSCADLOG' ,  dat['data'] ) }
					if ( dat['type'] === "object" ) { socket.emit('OPENSCADRES' ,  dat['data'] ) }
					if ( dat['type'] === "error"  ) { log.info(dat['data'])                      }
				};		
				worker.postMessage(data['script']);
			}
		});
		socket.on('error',function(err){
			log.info(err) 
		})
	});

	http.listen(PORT,function(){
		log.info('listening on port: ',PORT);
	});

 	/*worker.onmessage = function(event) {
		var output = ""
		var obj = JSON.parse(event['data']['data'])
		output += "solid shape, STL ascii file, created with Open CASCADE Technology\n";
		for ( var i = 0; i < obj.length-1; i+=9 ) {
			output += " facet normal 0.0 0.0 0.0\n";
      output +=  "   outer loop\n";
      output +=  "     vertex " + obj[i+0] + " " + obj[i+1] + " " + obj[i+2] + "\n";
      output +=  "     vertex " + obj[i+3] + " " + obj[i+4] + " " + obj[i+5] + "\n";
      output +=  "     vertex " + obj[i+6] + " " + obj[i+7] + " " + obj[i+8] + "\n";
      output +=  "   endloop\n";
      output +=  " endfacet\n";
		}
		output += "endsolid shape\n"
		console.log(output)
	}
	//var test = "this.foo = function(){ this.sphere({r:50});}" 

//var test = "this.foo = function(){this.polyhedron({points:[[10.0,10.0,0.0],[10,-10,0],[-10,-10,0],[-10,10,0],[0,0,10]],faces:[[0,1,4],[1,2,4],[2,3,4],[3,0,4],[1,0,3],[2,1,3]]});}"

	//worker.postMessage(test);*/
	
	

}());


 
