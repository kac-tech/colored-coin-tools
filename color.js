//constants
var COLOR = {
    MIXED: -1,
    UNKNOWN: -2,
    DEFAULT: 0
};

function uncolored(i) {
    return (i <= 0);
}

function compute_colors(inputs, outputs) {
    // initialize state
    var cur_amount = 0;
    var cur_color = COLOR.UNKNOWN;
    var i = 0; //input index

    for (var o = 0; o < outputs.length; ++o) {
	var want_amount = outputs[o].camount;

	if (want_amount > 0) {
            // normal output: make sure we have enough in cur_amount, eating as many inputs as necessary
	    while ((cur_amount < want_amount) && (i < inputs.length) && (inputs[i].camount >= 0)) {

                if (cur_amount == 0)
                    cur_color = inputs[i].color;
                else if (cur_color != inputs[i].color)
                    cur_color = COLOR.MIXED;

		cur_amount += inputs[i].camount;
		++i;
            }

            if (cur_amount < want_amount)
                return false; // transaction itself is invalid

        } else if(want_amount == 0){
            /* zero-valued outputs not supported yet
            // deal with zero-valued output
            if (cur_amount == 0 && i < inputs.length && inputs[i].amount == 0) {
                // there is a matching zero-valued input, eat it and use its color
                cur_color = inputs[i].color;
                ++i;
            } else {
                // there is no matching input so we cannot deduce zero-valued output's
                // color and thus use COLOR.MIXED
                cur_color = COLOR.MIXED;
            }
            */
            return false;
        } else {
            // want_amount < 0 so it's surely not colored output so break
            return true;
	}

        // color the output
        outputs[o].color = cur_color;
        cur_amount -= want_amount;
    }

    return true;
}

function validate_color_bands(inputs, errors) {
    // inputs of same color should be adjacent,
    // uncolored coins should go after colored.

    var seen_colors = {};
    var got_uncolored = false;
    var last_color = COLOR.UNKNOWN;

    for (var i = 0; i < inputs.length; ++i) {
        var c = inputs[i].color;
        if (c == COLOR.MIXED || c == COLOR.DEFAULT || c == COLOR.UNKNOWN) {
            got_uncolored = true;
        } else {
            if (got_uncolored) errors.uncolored_before_colored = true;
            if (c != last_color) {
                if (seen_colors[c])
                    errors.color_band_broken = true;
                else
                    seen_colors[c] = true;
                last_color = c;
            }
        }
    }
}

function validate_conservation(inputs, outputs, errors) {
    // check whether color conservation rule was violated.
    // besides general violation we try to detect two
    // particular cases:
    //  * coins got mixed
    //  * fee was paid with colored coins

    var input_color_amounts = {};
    var output_color_amounts = {};

    function getz(a, i) {
        var val = a[i];
        return val ? val : 0;
    }

    function sum_colors(points, sum) {
        var sum_uncolored = 0,
            sum_colored = 0;
        for (var i = 0; i < points.length; ++i) {
            var color = points[i].color,
                amount = points[i].amount;

            sum[color] = amount + getz(sum, color);

            if (uncolored(color))
                sum_uncolored += amount;
            else
                sum_colored += amount;
        }
        return {
            sum_uncolored: sum_uncolored,
            sum_colored: sum_colored
        };
    }

    var input = sum_colors(inputs, input_color_amounts);
    var output = sum_colors(outputs, output_color_amounts);

    for (var c in output_color_amounts) {
        if (!uncolored(c)) {
            if (getz(output_color_amounts, c) > getz(input_color_amounts, c))
                errors.conservation_gain = true;
        }
    }

    console.log(input_color_amounts);

    for (var c in input_color_amounts) {
        if (!uncolored(c)) {
            if (getz(output_color_amounts, c) < getz(input_color_amounts, c)) {
                console.log("loss: (" + c+ ") " + getz(output_color_amounts, c) + "<" +  getz(input_color_amounts, c));
                errors.conservation_loss = true;
            }
        }
    }


    var mixed_delta = getz(output_color_amounts, COLOR.MIXED) - getz(input_color_amounts, COLOR.MIXED);
    var color_delta = output.sum_colored - input.sum_colored;

    if (mixed_delta > 0)
        errors.got_mixed = true;

    if (mixed_delta + color_delta < 0)
        errors.color_fee = true;
}

function validate_zero_valued(inputs, outputs, errors) {
    // one zero-valued input should match one zero-valued input

    var zv_inputs_count = {};
    var zv_outputs_count = {};

    function getz(a, i) {
        var val = a[i];
        return val ? val : 0;
    }

    function count_zv(points, count) {
        for (var i = 0; i < points.length; ++i) {
            if (points[i].amount == 0) {
                count[points[i].color] = 1 + getz(count, points[i].color);
            }
        }
    }

    count_zv(inputs, zv_inputs_count);
    count_zv(outputs, zv_outputs_count);

    for (var c in zv_inputs_count) {
        if (getz(zv_inputs_count, c) > getz(zv_outputs_count, c))
            errors.zero_input_mismatch = true;
    }

    for (var c in zv_outputs_count) {
        if (getz(zv_inputs_count, c) < getz(zv_outputs_count, c))
            errors.zero_output_mismatch = true;
    }
}

function compute_and_validate_colors(inputs, outputs) {
    var errors = {
        got_mixed: false,
        color_fee: false,
        zero_input_mismatch: false,
        zero_output_mismatch: false,
        uncolored_before_colored: false,
	color_band_broken: false,
        conservation_gain: false,
        conservation_loss: false
    };
    if (compute_colors(inputs, outputs)) {
        validate_color_bands(inputs, errors);
        validate_conservation(inputs, outputs, errors);
        validate_zero_valued(inputs, outputs, errors);
        return errors;
    } else return false;
}

// carrier constants
var CARRIER_POWER_BITMASK = 0xF;
var CARRIER_BASE = 16; // assert(CARRIER_BASE > CARRIER_POWER_BITMASK)

function carrier_preprocess(ios){
    for(var i=0; i<ios.length; i++){
        var i_o = ios[i];
        var amount = i_o.amount;
        // get masked value
        var cpower = amount & CARRIER_POWER_BITMASK;
        // remove masked value from amount
        amount -= cpower;// or amount = amount & ~CARRIER_POWER_BITMASK
        // calculate carrier value
        var carrier = Math.pow(CARRIER_BASE, cpower+1);
        // remove carrier from amount
        var camount = amount - carrier;
        // value can (but not have to) be colored value only if camount>=0
        if(camount >= 0){
            i_o.camount = camount;
            i_o.carrier = carrier;
            i_o.cpower = cpower;	
        }else{
            i_o.camount = -1;
            i_o.carrier = -1;
            i_o.cpower = -1;
        }
    }
}

function test_compute_colors() {
    var inputs = [{color: 1, amount:0x0020}, // camount = 0x10, cpower = 0, carrier = 0x0010
                  {color: 1, amount:0x0030}, // camount = 0x20, cpower = 0, carrier = 0x0010
                  {color: 2, amount:0x0111}, // camount = 0x10, cpower = 1, carrier = 0x0100
                  {color: 0, amount:0x1032}];// camount = 0x30, cpower = 2, carrier = 0x1000
    var outputs = [{color: -2, amount: 0x0131}, // camount = 0x30, cpower = 1, carrier = 0x0100
                   {color: -2, amount: 0x0111}, // camount = 0x10, cpower = 1, carrier = 0x0100
		   {color: -2, amount: 0x0121}];// camount = 0x20, cpower = 1, carrier = 0x0100
    carrier_preprocess(inputs);
    carrier_preprocess(outputs);
    var errors =  compute_and_validate_colors(inputs, outputs);
    console.log(outputs);
    return errors;
}

