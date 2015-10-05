var app = app || angular.module('app', []);

app.controller("AvrSimController", function($scope){
    $scope.do_nothing = function(a){}
    $scope.debug_log = $scope.do_nothing;
    $scope.status = "Ready"
    $scope.cm_setup = function(){
	var sim_textarea = document.getElementById("simavr"+$scope.simid+"_program_area");
	$scope.debug_log($scope.simid,sim_textarea);
	if(sim_textarea == null) return;
	$scope.editor = CodeMirror.fromTextArea(sim_textarea, {
	    lineNumbers: true,
	    gutters: ["breakpoints", "CodeMirror-linenumbers"]
	});
	if($scope.program != ""){
	    $scope.editor.setSize(null, ($scope.program.split("\n").length + 2)*($scope.editor.defaultTextHeight()) + 10);
	}
	else{
	    $scope.editor.setSize(null, "100%");
	}
	$scope.editor.setValue($scope.program);
    }
    $scope.current_inst = "ldi r31,9";
    $scope.PC_display_mode = "t";
    $scope.RAM_display_mode = "d";
    $scope.RF_display_mode = "d";
    //$scope.program = "ldi r31,9\nadd r30,r31\nadd r30,r30\nadd r30,r30\ncp r30,r31\ncpi r30,36\nbreq 125\ninc r0\nadd r0,r30\nldi r31,0\nldi r30,11\nst Z,r0\nld r1,Z";
    $scope.RAM = [];
    $scope.PM = [];
    $scope.RF = [];
    
    $scope.PIND = 0;
    $scope.PORTD = 0;
    $scope.DDRD = 0;
    $scope.SPH = 0;
    $scope.SPL = 0;
    
    $scope.RAM_size = 4096;
    $scope.PM_size = 32;
    $scope.RF_size = 32;
    $scope.updated = [];
    $scope.error_line = 0;
    $scope.reset = function(pm_reset){
	$scope.PC = 0;
	$scope.Z = 0;
	$scope.C = 0;
	$scope.N = 0;
	$scope.updated = [];
	for(var i = 0; i < $scope.RF_size; i++) $scope.RF[i] = 0;
	for(var i = 0; i < $scope.RAM_size; i++) $scope.RAM[i] = 0;
	for(var i = 0; i < $scope.IORF_size; i++) $scope.IORF[i] = 0;
	if(pm_reset){ for(var i = 0; i < $scope.PM_size; i++) $scope.PM[i] = $scope.parse("nop"); }
	if($scope.editor) $scope.editor.removeLineClass($scope.error_line, "background", "active_line");
    }
    $scope.display_ram_start = 0;
    $scope.display_ram_length = 32;
    $scope.get_display_ram = function(){
	return $scope.RAM.slice($scope.display_ram_start, $scope.display_ram_start + $scope.display_ram_length);
    }
    $scope.change_program = function(prog){
	$scope.program = prog;
	if($scope.editor) $scope.editor.setValue(prog);
    }
    $scope.display_ram = function(i){
	if($scope.RAM_display_mode == "d"){
	    return $scope.RAM[i];
	}
	else if($scope.RAM_display_mode == "b"){
	    var s = $scope.RAM[i].toString(2);
	    return smul("0",8-s.length)+s;
	}
	else if($scope.RAM_display_mode == "h"){
	    var s = $scope.RAM[i].toString(16);
	    return "0x"+smul("0",2-s.length)+s;
	}
    }
    $scope.display_rf = function(i){
	if($scope.RF_display_mode == "d"){
	    return $scope.RF[i];
	}
	else if($scope.RF_display_mode == "b"){
	    var s = $scope.RF[i].toString(2);
	    return smul("0",8-s.length)+s;
	}
	else if($scope.RF_display_mode == "h"){
	    var s = $scope.RF[i].toString(16);
	    return "0x"+smul("0",2-s.length)+s;
	}
    }
    $scope.program_pm = function(){
	$scope.reset();
	$scope.program = $scope.editor.getValue();
	var lines = $scope.program.split("\n");
	var pm_addr = 0;
	for(var i = 0; i < lines.length; i++){
	    var inst = $scope.parse(lines[i]);
	    if(inst.error){
		$scope.error_on_line(i, inst.error);
		break;
	    }
	    else if(!(inst.directive)){
		$scope.PM[pm_addr] = inst;
		pm_addr++;
	    }
	}
    }
    $scope.error_on_line = function(linenum, err_msg){
	$scope.status = "Error on line " + linenum + ": " + err_msg;
	$scope.error_line = linenum;
	if($scope.editor) $scope.editor.addLineClass(linenum, "background", "active_line");
    }
    $scope.parse = function(inst){
	for(var d in $scope.directives){
	    var matches = inst.match($scope.directives[d].regex)
	    if(matches){
		$scope.directives[d].process(matches);
		return null;
	    }
	}
	$scope.debug_log(inst)
	var matches = inst.match(/^ *([^ ]+)* *([^;]*) *(;.*)?$/)
	var mnemonic = matches[1];
	var operand = matches[2];
	$scope.debug_log(mnemonic, "|||", operand);
	if(mnemonic in $scope.instructions){
	    var format = $scope.instructions[mnemonic].format;
	    var execf = $scope.instructions[mnemonic].exec;
	    var ops = operand.match($scope.formats[format].string);
	    if(!ops){
		return {"error":"Operands to instruction " + inst + " did not parse"};
	    }
	    for(var i = 0; i < 3; i++){
		if(/^[0-9]+$/.test(ops[i])) ops[i] = parseInt(ops[i]);
		//else if(format.sym_valid[i]) ops[i] = symbols[ops[i]];
	    }
	    var opcode = $scope.instructions[mnemonic].c;
	    $scope.debug_log(format, execf, ops, opcode);
	    var data = {"r":ops[1],"s":ops[2],"i":ops[3],"c":opcode};
	    var new_inst = new $scope.instruction(mnemonic + " " + operand, mnemonic, data, execf);
	    if(new_inst.check_valid()){
		return new_inst;
	    }
	    else{
		return {"error":"Illegal operands to instruction " + inst};
	    }
	}
	else{
	    $scope.raise_error("Bad instruction: "+inst);
	}
	return null;
    }
    $scope.is_updated = function(x){
	for(var i = 0; i < $scope.updated.length; i++){
	    if($scope.updated[i] == x) return true;
	}
	return false;
    }
    $scope.directives = {
	"label":{"regex":/^ *([a-zA-Z_][a-zA-Z0-9_]*): *$/,"process":function(args){
	    $scope.symbols[args[0]] = $scope.location;
	}},
	"byte":{"regex":/^ *\.byte ([0-9,]+) *$/,"process":function(args){

	}},
	"byte_ram":{"regex":/^ *\.byte\(([a-zA-Z_][a-zA-Z0-9_]*)\) ([0-9,]+) *$/,"process":function(args){
	    
	}},
	"string":{"regex":/^ *\.string ([0-9,]+) *$/,"process":function(args){

	}},
	"string_ram":{"regex":/^ *\.string\(([a-zA-Z_][a-zA-Z0-9_]*)\) ([0-9,]+) *$/,"process":function(args){

	}},
    }
    $scope.formats = {
	"4r8i":{"string":/ *r([0-9]+), *()([0-9]+) */,"binary":"CCCCIIIIRRRRIIII","validator":function(c, r, s, i){return 16 <= r && r < 32 && 0 <= i && i < 256;}},
	"5r5s":{"string":/ *r([0-9]+), *r([0-9]+)() */,"binary":"CCCCCCSRRRRRSSSS","validator":function(c, r, s, i){return 0 <= r && r < 32 && 0 <= s && s < 32;}},
	"6s5r":{"string":/ *r([0-9]+), *([0-9]+)() */,"binary":"CCCCCSSRRRRRSSSS","validator":function(c, r, s, i){return 0 <= r && r < 32 && 0 <= s && s < 64;}},
	"5r6s":{"string":/ *([0-9]+), *r([0-9]+)() */,"binary":"CCCCCSSRRRRRSSSS","validator":function(c, r, s, i){return 0 <= r && r < 64 && 0 <= s && s < 32;}},
	"5r":{"string":/ *r([0-9]+)()() */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= r && r < 32;}},
	"5rX":{"string":/ *r([0-9]+)(), *(X\+|-X|X) */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= r && r < 32;}},
	"X5r":{"string":/ *(X\+|-X|X), *r([0-9]+)() */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= s && s < 32;}},
	//"5rmX":{"string":/ *r([0-9]+)()(), *-X */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= r && r < 32;}},
	//"mX5r":{"string":/ *-X, *r([0-9]+)()() */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= r && r < 32;}},
	//"5rZ":{"string":/ *r([0-9]+)()(), *Z */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= r && r < 32;}},
	//"Z5r":{"string":/ *Z, *r([0-9]+)()() */,"binary":"CCCCCCCRRRRRCCCC","validator":function(c, r, s, i){return 0 <= r && r < 32;}},
	"12i":{"string":/ *()()([0-9]+) */,"binary":"CCCCIIIIIIIIIIII","validator":function(c, r, s, i){return 0 <= i && i < 4096;}},
	"7i":{"string":/ *()()([0-9]+) */,"binary":"CCCCCCIIIIIIICCC","validator":function(c, r, s, i){return 0 <= i && i < 128;}},
	"n":{"string":/ *()()() */,"binary":"CCCCCCCCCCCCCCCC","validator":function(c, r, s, i){return true;}}
    }
    $scope.encode = function(format, c, r, s, i){
	var fmt = $scope.formats[format].binary;
	var inst = 0;
	for(var j = 0; j < 16; j++) {
	    if(fmt[j] == "C"){
		inst += (c%2)<<j;
		c >>= 1;
	    }
	    if(fmt[j] == "R"){
		inst += (r%2)<<j;
		r >>= 1;
	    }
	    if(fmt[j] == "S"){
		inst += (s%2)<<j;
		s >>= 1;
	    }
	    if(fmt[j] == "I"){
		inst += (i%2)<<j;
		i >>= 1;
	    }
	}
	return inst;
    }
    $scope.decode = function(fmt, x){
	var inst = {"c":0,"r":0,"s":0,"i":0};
	for(var i = 15; i >= 0; i--) {
	    var b = (x>>i)&1;
	    if(fmt[i] == "C"){
		inst.c = 2*(inst.c) + b;
	    }
	    if(fmt[i] == "R"){
		inst.r = 2*(inst.r) + b;
	    }
	    if(fmt[i] == "S"){
		inst.s = 2*(inst.s) + b;
	    }
	    if(fmt[i] == "I"){
		inst.i = 2*(inst.i) + b;
	    }
	}
	return inst;
    }
    $scope.label = function(name, addr){
	this.label = true;
	this.name = name;
	this.addr = addr;
    }
    $scope.instruction = function(text, mnemonic, data, exec){
	thislabel = false;
	this.text = text;
	this.c = data.c;
	this.r = data.r;
	this.s = data.s;
	this.i = data.i;
	this.mnemonic = mnemonic;
	$scope.debug_log(this.text, this.c, this.r, this.s, this.i, this.mnemonic);
	this.format = $scope.instructions[this.mnemonic].format;
	this.encoding = $scope.encode(this.format, this.c, this.r, this.s, this.i);
	this.display = function(){
	    if($scope.PC_display_mode == "t"){
		return this.text;
	    }
	    else if($scope.PC_display_mode == "d"){
		return this.encoding;
	    }
	    else if($scope.PC_display_mode == "h"){
		var s = this.encoding.toString(16);
		return "0x"+smul("0",4 - s.length)+s;
	    }
	    else if($scope.PC_display_mode == "b"){
		var s = this.encoding.toString(2);
		return smul("0",16 - s.length) + s;
	    }
	}
	this.check_valid = function(){
	    return $scope.formats[this.format].validator(this.c, this.r, this.s, this.i);
	}
	this.run = function(){
	    if($scope.formats[this.format].validator(this.c, this.r, this.s, this.i)){
		exec(this.c, this.r, this.s, this.i);
	    }
	    else{
		$scope.raise_error("Illegal instruction: "+text);
	    }
	}
    }
    function smul(str, num) {
	var acc = [];
	for (var i = 0; (1 << i) <= num; i++) {
	    if ((1 << i) & num)
		acc.push(str);
	    str += str;
	}
	return acc.join("");
    }
    $scope.step = function(){
	var i = $scope.PM[$scope.PC];
	$scope.debug_log("i",i);
	i.run();
    }
    $scope.raise_error = function(s){
	$scope.status = "Error: " + s;
    }
    $scope.truncate = function(num, bits){
	var mod = 1<<bits;
	return ((num % mod)+mod)%mod;
    }
    $scope.update_sreg = function(result, z, c, n){
	if(z) $scope.Z = $scope.truncate(result,8) == 0 ? 1 : 0;
	if(c) $scope.C = result >= 256 || result < 0 ? 1 : 0;
	if(n) $scope.N = $scope.truncate(result,8) >= 128 ? 1 : 0;
    }
    $scope.read_IO = function(s){
	if(s == 16) return $scope.PIND & (~($scope.DDRD));
	else if(s == 17) return $scope.DDRD;
	else if(s == 61) return $scope.SPL;
	else if(s == 62) return $scope.SPH;
	return 0;
    }
    $scope.write_IO = function(s,val){
	if(s == 18) $scope.PORTD = $scope.DDRD & val;
	else if(s == 17) $scope.DDRD = val;
	else if(s == 61) $scope.SPL = val;
	else if(s == 62) $scope.SPH = val;
    }
    $scope.incX = function(){
	console.log($scope.RF[26]);
	$scope.RF[26]++;
	if($scope.RF[26] == 256){
	    $scope.RF[26] = 0;
	    $scope.RF[27] = $scope.truncate($scope.RF[27]+1,8);
	}
	console.log($scope.RF[26]);
    }
    $scope.decX = function(){
	$scope.RF[26]--;
	if($scope.RF[26] == -1){
	    $scope.RF[26] = 255;
	    $scope.RF[27] = $scope.truncate($scope.RF[27]-1,8);
	}
    }
    $scope.incSP = function(){
	$scope.SPL++;
	if($scope.SPL == 256){
	    $scope.SPL = 0;
	    $scope.SPH = $scope.truncate($scope.SPH+1,8);
	}
    }
    $scope.decSP = function(){
	$scope.SPL--;
	if($scope.SPL == -1){
	    $scope.SPL = 255;
	    $scope.SPH = $scope.truncate($scope.SPH-1,8);
	}
    }
    $scope.instructions = {
	"ldi":{"format":"4r8i", "c": 14, "exec":function(c, r, s, i){
	    $scope.RF[r] = i;
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"mov":{"format":"5r5s", "c": 11, "exec":function(c, r, s, i){
	    $scope.RF[r] = $scope.RF[s];
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"add":{"format":"5r5s", "c": 3, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] + $scope.RF[s], true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] + $scope.RF[s],8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"adc":{"format":"5r5s", "c": 7, "exec":function(c, r, s, i){
	    var oldC = $scope.C;
	    $scope.update_sreg($scope.RF[r] + $scope.RF[s] + oldC, true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] + $scope.RF[s] + oldC,8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"sbc":{"format":"5r5s", "c": 2, "exec":function(c, r, s, i){
	    var oldC = $scope.C;
	    $scope.update_sreg($scope.RF[r] - $scope.RF[s] - oldC, true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] - $scope.RF[s] - oldC,8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"sub":{"format":"5r5s", "c": 6, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] - $scope.RF[s], true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] - $scope.RF[s],8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"cp":{"format":"5r5s", "c": 5, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] - $scope.RF[s], true, true, true);
	    $scope.PC++;
	    $scope.updated = ["PC", "Z", "C", "N"];}},
	"and":{"format":"5r5s", "c": 8, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] & $scope.RF[s], true, false, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] & $scope.RF[s],8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"or":{"format":"5r5s", "c": 10, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] | $scope.RF[s], true, false, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] | $scope.RF[s],8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"eor":{"format":"5r5s", "c": 9, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] ^ $scope.RF[s], true, false, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] ^ $scope.RF[s],8);
	    $scope.PC++;
	    $scope.updated = [r, "PC", "Z", "C", "N"];}},
	"cpi":{"format":"4r8i", "c": 3, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] - i, true, true, true);
	    $scope.PC++;
	    $scope.updated = ["PC","Z","C","N"];}},
	"subi":{"format":"4r8i", "c": 5, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] - i, true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] - i,8);
	    $scope.PC++;
	    $scope.updated = ["PC","Z","C","N"];}},
	"andi":{"format":"4r8i", "c": 7, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] & i, true, false, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] & i,8);
	    $scope.PC++;
	    $scope.updated = ["PC","Z","C","N"];}},
	"ori":{"format":"4r8i", "c": 6, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] | i, true, false, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] | i,8);
	    $scope.PC++;
	    $scope.updated = ["PC","Z","C","N"];}},
	"dec":{"format":"5r", "c": 1194, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] - 1, true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] - 1,8);
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"inc":{"format":"5r", "c": 1187, "exec":function(c, r, s, i){
	    $scope.update_sreg($scope.RF[r] + 1, true, true, true);
	    $scope.RF[r] = $scope.truncate($scope.RF[r] + 1,8);
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"com":{"format":"5r", "c": 1184, "exec":function(c, r, s, i){
	    $scope.update_sreg(~($scope.RF[r]), true, false, true);
	    $scope.RF[r] = $scope.truncate(~($scope.RF[r]),8);
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"ld":{"format":"5rX", "c": 1164, "exec":function(c, r, s, i){
	    var X = $scope.RF[26]+256*$scope.RF[27];
	    if(i == "-X"){
		X = $scope.decX();
	    }
	    $scope.RF[r] = $scope.RAM[X];
	    if(i == "X+"){
		X = $scope.incX();
	    }
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"st":{"format":"X5r", "c": 1180, "exec":function(c, r, s, i){
	    i = r;
	    r = s;
	    var X = $scope.RF[26]+256*$scope.RF[27];
	    console.log(r,s,i);
	    if(i == "-X"){
		X = $scope.decX();
	    }
	    $scope.RAM[X] = $scope.RF[r];
	    $scope.PC++;
	    $scope.updated = ["["+X+"]","PC"];
	    if(i == "X+"){
		X = $scope.incX();
	    }}},
	"rjmp":{"format":"12i", "c": 12, "exec":function(c, r, s, i){
	    $scope.PC = $scope.truncate($scope.PC + i,16);
	    $scope.updated = ["PC"];}},
	"breq":{"format":"7i", "c": 481, "exec":function(c, r, s, i){
	    $scope.PC = $scope.truncate($scope.PC + ($scope.Z == 1 ? (i <= 64 ? i : i-128) : 1),16);
	    $scope.updated = ["PC"];}},
	"brne":{"format":"7i", "c": 489, "exec":function(c, r, s, i){
	    $scope.PC = $scope.truncate($scope.PC + ($scope.Z == 0 ? (i <= 64 ? i : i-128) : 1),16);
	    $scope.updated = ["PC"];}},
	"brsh":{"format":"7i", "c": 488, "exec":function(c, r, s, i){
	    $scope.PC = $scope.truncate($scope.PC + ($scope.C == 1 ? (i <= 64 ? i : i-128) : 1),16);
	    $scope.updated = ["PC"];}},
	"brlo":{"format":"7i", "c": 480, "exec":function(c, r, s, i){
	    $scope.PC = $scope.truncate($scope.PC + ($scope.C == 0 ? (i <= 64 ? i : i-128) : 1),16);
	    $scope.updated = ["PC"];}},
	"in":{"format":"5r6s", "c": 22, "exec":function(c, r, s, i){
	    $scope.RF[r] = $scope.read_IO(s);
	    $scope.PC++;
	    $scope.updated = [r,"PC"];}},
	"out":{"format":"5r6s", "c": 23, "exec":function(c, r, s, i){
	    i = s;
	    s = r;
	    r = i;
	    $scope.write_IO(s,$scope.RF[r]);
	    $scope.PC++;
	    $scope.updated = ["PC"];}},
	"push":{"format":"5r", "c": 1183, "exec":function(c, r, s, i){
	    var SP = $scope.SPH * 256 + $scope.SPL;
	    $scope.RAM[SP] = $scope.RF[r];
	    $scope.decSP();
	    $scope.PC++;
	    $scope.updated = ["PC","["+SP+"]","SPH","SPL"];}},
	"pop":{"format":"5r", "c": 1167, "exec":function(c, r, s, i){
	    $scope.incSP();
	    var SP = $scope.SPH * 256 + $scope.SPL;
	    $scope.RF[r] = $scope.RAM[SP];
	    $scope.PC++;
	    $scope.updated = ["PC","SPH","SPL"];}},
	"rcall":{"format":"12i", "c": 13, "exec":function(c, r, s, i){
	    var PCL = $scope.PC % 256;
	    var PCH = Math.floor($scope.PC / 256);
	    var SP = $scope.SPH * 256 + $scope.SPL;
	    $scope.RAM[SP] = PCH;
	    $scope.decSP();
	    var SP = $scope.SPH * 256 + $scope.SPL;
	    $scope.RAM[SP] = PCL;
	    $scope.decSP();
	    $scope.PC++;
	    $scope.updated = ["PC","["+SP+"]","SPH","SPL"];}},
	"ret":{"format":"n", "c": 38152, "exec":function(c, r, s, i){
	    $scope.incSP();
	    var SP = $scope.SPH * 256 + $scope.SPL;
	    var PCL = $scope.RAM[SP];
	    $scope.incSP();
	    var SP = $scope.SPH * 256 + $scope.SPL;
	    var PCH = $scope.RAM[SP];
	    $scope.PC = PCL + 256*PCH;
	    $scope.updated = ["PC","SPH","SPL"];}},
	"nop":{"format":"n", "c": 0, "exec":function(c, r, s, i){
	    $scope.PC++;
	    $scope.updated = ["PC"];}},
	"halt":{"format":"n", "c": 1, "exec":function(c, r, s, i){
	    $scope.reset(false);}}
    };
    $scope.reset(true);
    setTimeout($scope.cm_setup, 0);
})
    .directive('simAvr',function(){
	return {
	    restrict: 'E',
	    scope:{
		program: '=program',
		text:'=',
		control: '=',
		size: '@size',
		lightboard_feature: '@lightboard',
		reset_feature: '@reset',
		simid: '@simid',
		debug_mode_feature:'@debug'
	    },
	    templateUrl: function(element,attrs){
		return attrs.template;
	    },
	    controller: 'AvrSimController',
	    link: function(scope,element,attrs){
		scope.debug_log = scope.debug_mode_feature == 'yes' ? console.log.bind(console) : scope.do_nothing;
		if(scope.control){
		    scope.control.set_program = function(new_prog){
			scope.change_program(new_prog);
		    }
		    scope.control.get_program = function(){
			return scope.program;
		    }
		    scope.$emit("jsavr_linked");
		}
	    }
	}
    });

