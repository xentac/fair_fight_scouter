// ==UserScript==
// @name          FF Scouter
// @namespace     Violentmonkey Scripts
// @match         https://www.torn.com/*
// @version       1.15
// @author        rDacted
// @description   Shows the expected Fair Fight score against targets
// @grant         GM_xmlhttpRequest
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_deleteValue
// @grant         GM_registerMenuCommand
// @grant         GM_addStyle
// @connect       absolutely-golden-airedale.edgecompute.app
// ==/UserScript==

console.log("FF Scouter version 1.15 starting")

// Website: https://rdacted2.github.io/fair_fight_scouter/
//
// NOTE
// This script requires a limited access api key, or a custom key generated with the following permissions
// https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=torn&user=basic,attacks,battlestats
//
// Your key is sent to a backend service which does the following
// - Obtains your identity (for authentication)
// - Obtains your battle stats
// - Looks at your attack history
//
// For the sake of your privacy, the following happens
// - Your key is not stored on the server
// - Your battle stats are converted into a single battle score, which is the summation of the square
//   root of each of your four stats. This information is not private, as it's leaked anytime you make
//   an attack (or are attacked)
// - The only data I use from the attack log is the identity of your opponent, and the fair-fight
//   value of the fight
//
// Full disclosure
// I have a separate service that I provide to unmask stealth attackers.
// I DO NOT USE the attack data to identify when you have stealth attacked someone so that I can report
// you to them.
// I specifically released my stealth reveal capabilities to show that I can do it without any privileged
// access, and I promise not to abuse any privileged access provided to me by your key in order to
// reveal privileged information to any third party.
// If I happen to reveal you as the stealthed attacker to someone else, the source of that data is public
// information that everyone already has access to
//
// If you're concerned about sharing your battle score, note that anyone you defeat can calculate your
// battle score by simply calculating their battle score and using the fair-fight value of your attack
// to determine what your battle score is. It's not public information, but it's also not private.

GM_addStyle(`
    .ff-scouter-indicator {
      position: relative;
      display: block;
      padding: 0;
    }

    .ff-scouter-vertical-line-low-upper {
      content: '';
      position: absolute;
      top: 0;
      left: 40%;
      width: 2px;
      height: 30%;
      background-color: black;
    }

    .ff-scouter-vertical-line-low-lower {
      content: '';
      position: absolute;
      bottom: 0;
      left: 40%;
      width: 2px;
      height: 30%;
      background-color: black;
    }

    .ff-scouter-vertical-line-high-upper {
      content: '';
      position: absolute;
      top: 0;
      left: 75%;
      width: 2px;
      height: 30%;
      background-color: black;
    }

    .ff-scouter-vertical-line-high-lower {
      content: '';
      position: absolute;
      bottom: 0;
      left: 75%;
      width: 2px;
      height: 30%;
      background-color: black;
    }

    .ff-scouter-indicator-upper {
      content: "";
      position: absolute;
      overflow: hidden;
      top: 0;
      left: 0;
      width: 100%;
      height: 30%;
      background: linear-gradient(to right, #0000FF, #00FF00, #FF0000);
      clip-path: inset(
          0 /* top */
          calc(100% - var(--band-width) - var(--band-percent) * (100% - var(--band-width)) / 100) /* right */
          0 /* bottom */
          calc(var(--band-percent) * (100% - var(--band-width)) / 100) /* left */
          );
      z-index: 0;
      padding: 0;
      pointer-events: none; /* Allow clicks to pass through */
    }

    .ff-scouter-indicator-lower {
      content: "";
      position: absolute;
      overflow: hidden;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 30%;
      background: linear-gradient(to right, #0000FF, #00FF00, #FF0000);
      clip-path: inset(
          0 /* top */
          calc(100% - var(--band-width) - var(--band-percent) * (100% - var(--band-width)) / 100) /* right */
          0 /* bottom */
          calc(var(--band-percent) * (100% - var(--band-width)) / 100) /* left */
          );
      z-index: 0;
      padding: 0;
      pointer-events: none; /* Allow clicks to pass through */
    }

    .ff-scouter-target {
      position: absolute;
      transform: translateX(-50%);
      padding: 0;
      top: 0;
      left: calc(var(--band-width) / 2 + var(--band-percent) * (100% - var(--band-width)) / 100);
      height: 100%;
      object-fit: cover;
      pointer-events: none; /* Allow clicks to pass through */
    }
`);

var BASE_URL = "https://absolutely-golden-airedale.edgecompute.app";
var PERFECT_FF = "https://raw.githubusercontent.com/rDacted2/fair_fight_scouter/main/images/lime_green_stars.gif"
var WORST_FF = "https://raw.githubusercontent.com/rDacted2/fair_fight_scouter/main/images/poop.gif";

var rD_xmlhttpRequest;
var rD_setValue;
var rD_getValue;
var rD_deleteValue;
var rD_registerMenuCommand;

// DO NOT CHANGE THIS
// DO NOT CHANGE THIS
var apikey = '###PDA-APIKEY###';
// DO NOT CHANGE THIS
// DO NOT CHANGE THIS
if (apikey[0] != '#') {
    console.log("Adding modifications to support TornPDA");
    rD_xmlhttpRequest = function (details) {
        console.log("Attempt to make http request");
        if (details.method.toLowerCase() == "get") {
            return PDA_httpGet(details.url)
                .then(details.onload)
                .catch(details.onerror ?? ((e) => console.error(e)));
        }
        else if (details.method.toLowerCase() == "post") {
            return PDA_httpPost(details.url, details.headers ?? {}, details.body ?? details.data ?? "")
                .then(details.onload)
                .catch(details.onerror ?? ((e) => console.error(e)));
        }
        else {
            console.log("What is this? " + details.method);
        }
    }
    rD_setValue = function (name, value) {
        console.log("Attempted to set " + name);
        return localStorage.setItem(name, value);
    }
    rD_getValue = function (name, defaultValue) {
        var value = localStorage.getItem(name) ?? defaultValue;
        //console.log("Attempted to get " + name + " -> " + value);
        return value;
    }
    rD_deleteValue = function (name) {
        console.log("Attempted to delete " + name);
        return localStorage.removeItem(name);
    }
    rD_registerMenuCommand = function () {
        console.log("Disabling GM_registerMenuCommand");
    }
    rD_setValue('limited_key', apikey);
}
else {
    rD_xmlhttpRequest = GM_xmlhttpRequest;
    rD_setValue = GM_setValue;
    rD_getValue = GM_getValue;
    rD_deleteValue = GM_deleteValue;
    rD_registerMenuCommand = GM_registerMenuCommand;
}

var key = rD_getValue("limited_key", null);
var button = null;

rD_registerMenuCommand('Enter Limited API Key', () => {
    let userInput = prompt("Enter Limited API Key", rD_getValue('limited_key', ""));
    if (userInput !== null) {
        rD_setValue('limited_key', userInput);
        // Reload page
        window.location.reload();
    }
});

var first_update_request = true;
function force_update() {
    if (first_update_request) {
        first_update_request = false;

        const url = `${BASE_URL}/api/v2/force_update?api_key=${key}`;
        //console.log(url);

        rD_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function (response) {
                console.log(`force update returned ${response.status}`);
                if (response.status == 200) {
                    const match1 = window.location.href.match(/https:\/\/www.torn.com\/profiles.php\?XID=(?<target_id>\d+)/);
                    const match2 = window.location.href.match(/https:\/\/www.torn.com\/loader.php\?sid=attack&user2ID=(?<target_id>\d+)/);
                    const match = match1 ?? match2
                    if (match) {
                        var target_id = match.groups.target_id
                        // Invalidate this target_id
                        rD_deleteValue("" + target_id);
                        // Download the new update
                        update_ff_cache([target_id], function (target_ids) { display_fair_fight(target_ids[0]) })
                    }
                }
            },
            onerror: function (e) { console.error('**** error ', e); },
            onabort: function (e) { console.error('**** abort ', e); },
            ontimeout: function (e) { console.error('**** timeout ', e); }
        });
    }
}


function create_text_location() {
    button = document.createElement('div');
    button.id = "battleScoreKeyPanel";
    button.style.display = 'flex'; // Use flexbox for centering
    button.style.cursor = 'pointer'; // Change cursor to pointer
    button.addEventListener('click', () => {
        if (key === null) {
            const limited_key = prompt("Enter Limited API Key", rD_getValue('limited_key', ""));
            if (limited_key) {
                // Store the API key with rD_setValue
                rD_setValue('limited_key', limited_key);
                key = limited_key;
                // Reload page
                window.location.reload();
            }
        } else {
            force_update();
        }
    });

    var h4 = $("h4")[0]
    if (h4.textContent === "Attacking") {
        h4.parentNode.parentNode.after(button);
    } else {
        h4.after(button);
    }

    return button;
}

function set_message(message, error = false) {
    while (button.firstChild) {
        button.removeChild(button.firstChild);
    }

    const textNode = document.createTextNode(message);
    if (error) {
        button.style.color = "red";
    }
    else {
        button.style.color = "";
    }
    button.appendChild(textNode);
}

function update_ff_cache(player_ids, callback) {
    if (!key) {
        return
    }

    // Given a list of players remove any where the cache is already fresh enough
    // Then make a request for any unknown players and call the callback
    var unknown_player_ids = get_cache_misses(player_ids)

    if (unknown_player_ids.length > 0) {
        var player_id_list = unknown_player_ids.join(",")
        const url = `${BASE_URL}/api/v2/fair_fight?api_key=${key}&id=${player_id_list}`;
        //console.log(url);

        rD_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function (response) {
                if (response.status == 200) {
                    var ff_response = JSON.parse(response.responseText);
                    if (ff_response.success) {
                        var one_hour = 60 * 60 * 1000;
                        var expiry = Date.now() + one_hour;
                        for (const player_id of unknown_player_ids) {
                            if (ff_response.success[player_id]) {
                                // Cache the value
                                //console.log("Caching stats for " + player_id);
                                ff_response.success[player_id].expiry = expiry;
                                rD_setValue("" + player_id, JSON.stringify(ff_response.success[player_id]));
                            }
                        }

                        callback(player_ids);
                    }
                    else if (ff_response.error) {
                        set_message(`FF query failed: ${ff_response.error}`, true);
                        if (ff_response.key_invalid) {
                            console.log("Deleting key");
                            rD_deleteValue("limited_key")
                        }
                    }
                    else {
                        console.log("An unknown error occurred: " + ff_response);
                    }
                }
                else {
                    console.log("Failed to make request, status code " + response.status);
                }
            },
            onerror: function (e) { console.error('**** error ', e); },
            onabort: function (e) { console.error('**** abort ', e); },
            ontimeout: function (e) { console.error('**** timeout ', e); }
        });
    } else {
        callback(player_ids);
    }
}

function display_fair_fight(target_id) {
    var cached_ff_response = rD_getValue("" + target_id, null);
    try {
        cached_ff_response = JSON.parse(cached_ff_response);
    }
    catch {
        cached_ff_response = null;
    }

    if (cached_ff_response) {
        if (cached_ff_response.expiry > Date.now()) {
            //console.log("Using cached FF data");
            set_fair_fight(cached_ff_response);
        }
    }
}

function get_ff_string(ff_response) {
    const ff_low = ff_response.ff_low.toFixed(2);
    const ff_high = (ff_response.ff_high || 0).toFixed(2);

    const now = Date.now() / 1000;
    const age = now - ff_response.timestamp;

    var suffix = ""
    if (age > (14 * 24 * 60 * 60)) {
        suffix = "?"
    }

    if (ff_low == ff_high) {
        return `${ff_low}${suffix}`
    }

    if (ff_low < ff_high) {
        return `${ff_low}-${ff_high}${suffix}`
    }

    return `${ff_low}+${suffix}`
}

function get_ff_string_short(ff_response) {
    const ff_low = ff_response.ff_low.toFixed(2);
    const ff_high = (ff_response.ff_high || 0).toFixed(2);

    const now = Date.now() / 1000;
    const age = now - ff_response.timestamp;

    if (ff_low > 9) {
        return 'high';
    }

    var suffix = ""
    if (age > (14 * 24 * 60 * 60)) {
        suffix = "?";
    }

    if (ff_low == ff_high) {
        return `${ff_low}${suffix}`
    }

    // The space is important so the line can be split correctly
    if (ff_low < ff_high) {
        return `${ff_low}- ${ff_high}${suffix}`
    }

    return `${ff_low}+${suffix}`
}

function set_fair_fight(ff_response) {
    const ff_string = get_ff_string(ff_response)

    const now = Date.now() / 1000;
    const age = now - ff_response.timestamp;

    var fresh = "";

    if (age < 24 * 60 * 60) {
        // Pass
    }
    else if (age < 31 * 24 * 60 * 60) {
        var days = Math.round(age / (24 * 60 * 60));
        if (days == 1) {
            fresh = "(1 day old)";
        }
        else {
            fresh = `(${days} days old)`;
        }
    }
    else if (age < 365 * 24 * 60 * 60) {
        var months = Math.round(age / (31 * 24 * 60 * 60));
        if (months == 1) {
            fresh = "(1 month old)";
        }
        else {
            fresh = `(${months} months old)`;
        }
    }
    else {
        var years = Math.round(age / (365 * 24 * 60 * 60));
        if (years == 1) {
            fresh = "(1 year old)";
        }
        else {
            fresh = `(${years} years old)`;
        }
    }


    set_message(`Fair Fight ${ff_string} ${fresh}`);
}

function get_members() {
    var player_ids = [];
    $(".table-body > .table-row").each(function () {
        if (!$(this).find(".fallen").length) {
            if (!$(this).find(".fedded").length) {
                $(this).find(".member").each(function (index, value) {
                    var url = value.querySelectorAll('a[href^="/profiles"]')[0].href;
                    var player_id = url.match(/.*XID=(?<player_id>\d+)/).groups.player_id;
                    player_ids.push(parseInt(player_id));
                });
            }
        }
    });

    return player_ids;
}

function rgbToHex(r, g, b) {
    return '#' +
        ((1 << 24) + (r << 16) + (g << 8) + b)
            .toString(16)
            .slice(1)
            .toUpperCase(); // Convert to hex and return
}

function get_ff_colour(value) {
    let r, g, b;

    // Transition from
    // blue - #2828c6
    // to
    // green - #28c628
    // to
    // red - #c62828
    if (value <= 1) {
        // Blue
        r = 0x28;
        g = 0x28;
        b = 0xc6;
    } else if (value <= 3) {
        // Transition from blue to green
        const t = (value - 1) / 2; // Normalize to range [0, 1]
        r = 0x28;
        g = Math.round(0x28 + ((0xc6 - 0x28) * t));
        b = Math.round(0xc6 - ((0xc6 - 0x28) * t));
    } else if (value <= 5) {
        // Transition from green to red
        const t = (value - 3) / 2; // Normalize to range [0, 1]
        r = Math.round(0x28 + ((0xc6 - 0x28) * t));
        g = Math.round(0xc6 - ((0xc6 - 0x28) * t));
        b = 0x28;
    } else {
        // Red
        r = 0xc6;
        g = 0x28;
        b = 0x28;
    }

    return rgbToHex(r, g, b); // Return hex value
}

function get_contrast_color(hex) {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Calculate brightness
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    return (brightness > 126) ? 'black' : 'white'; // Return black or white based on brightness
}

function apply_fair_fight_info(player_ids) {
    const fair_fights = new Object();

    for (const player_id of player_ids) {
        var cached_ff_response = rD_getValue("" + player_id, null);
        try {
            cached_ff_response = JSON.parse(cached_ff_response);
        }
        catch {
            cached_ff_response = null;
        }

        if (cached_ff_response) {
            if (cached_ff_response.expiry > Date.now()) {
                fair_fights[player_id] = cached_ff_response;
            }
        }
    }

    var header_li = document.createElement("li");
    header_li.tabIndex = "0";
    header_li.classList.add("table-cell");
    header_li.classList.add("lvl");
    header_li.classList.add("torn-divider");
    header_li.classList.add("divider-vertical");
    header_li.classList.add("c-pointer");
    header_li.appendChild(document.createTextNode("FF"));

    $(".table-header > .lvl")[0].after(header_li);

    $(".table-body > .table-row > .member").each(function (index, value) {
        var url = value.querySelectorAll('a[href^="/profiles"]')[0].href;
        var player_id = url.match(/.*XID=(?<player_id>\d+)/).groups.player_id;

        var fair_fight_div = document.createElement("div");
        fair_fight_div.classList.add("table-cell");
        fair_fight_div.classList.add("lvl");

        // Lookup the fair fight score from cache
        if (fair_fights[player_id]) {
            const ff_low = fair_fights[player_id].ff_low;
            const ff_string = get_ff_string_short(fair_fights[player_id])

            const background_colour = get_ff_colour(ff_low);
            const text_colour = get_contrast_color(background_colour);
            fair_fight_div.style.backgroundColor = background_colour;
            fair_fight_div.style.color = text_colour;
            fair_fight_div.style.fontWeight = 'bold';
            var text = document.createTextNode(ff_string);
            fair_fight_div.appendChild(text);
        }

        value.nextSibling.after(fair_fight_div);
    });
}

function get_cache_misses(player_ids) {
    var unknown_player_ids = []
    for (const player_id of player_ids) {
        var cached_ff_response = rD_getValue("" + player_id, null);
        try {
            cached_ff_response = JSON.parse(cached_ff_response);
        }
        catch {
            cached_ff_response = null;
        }

        if ((!cached_ff_response) ||
            (cached_ff_response.expiry < Date.now()) ||
            (cached_ff_response.age > (7 * 24 * 60 * 60))) {
            unknown_player_ids.push(player_id);
        }
    }

    return unknown_player_ids;
}

create_text_location();

const match1 = window.location.href.match(/https:\/\/www.torn.com\/profiles.php\?XID=(?<target_id>\d+)/);
const match2 = window.location.href.match(/https:\/\/www.torn.com\/loader.php\?sid=attack&user2ID=(?<target_id>\d+)/);
const match = match1 ?? match2
if (match) {
    // We're on a profile page or an attack page - get the fair fight score
    var target_id = match.groups.target_id
    update_ff_cache([target_id], function (target_ids) { display_fair_fight(target_ids[0]) })

    if (!key) {
        set_message("Limited API key needed - click to add");
    }
}
else if (window.location.href.startsWith("https://www.torn.com/factions.php")) {
    const torn_observer = new MutationObserver(function () {
        // Find the member table - add a column if it doesn't already have one, for FF scores
        var members_list = $(".members-list")[0];
        if (members_list) {
            torn_observer.disconnect()

            var player_ids = get_members();
            update_ff_cache(player_ids, apply_fair_fight_info)
        }
    });

    torn_observer.observe(document, { attributes: false, childList: true, characterData: false, subtree: true });

    function set_colours() {
        $(".chain-attacks-list").children("li").each(function () {
            if ($(this).hasClass("ff_processed") == false) {
                var success = false;
                if ($(this).find(".chain-arrow-icon").hasClass("enemy") == false) {

                    const ff_str = $(this).find(".fair-fight").attr('title');
                    if (ff_str) {
                        const isRetal = $(this).find(".retaliation").attr("title") !== "Retaliation: None";
                        const match = ff_str.match(/Fair fight: x(?<ff_val>\d.\d+)/);
                        if (match) {
                            const ff_val = match.groups.ff_val;
                            if (ff_val === "3.00") {
                                $(this).css({ backgroundImage: `url(${PERFECT_FF})` });
                            } else {
                                const ff_float = parseFloat(ff_val);
                                if (ff_float > 2.5 || isRetal) {
                                    $(this).css({ backgroundColor: '#2e5902' });
                                } else if (ff_float > 2.0) {
                                    $(this).css({ backgroundColor: '#575504' });
                                } else if (ff_float > 1.3) {
                                    $(this).css({ backgroundColor: '#574404' });
                                } else {
                                    // If war do poop, if chain > 10 do poop, otherwise, extra brown
                                    if ($(this).find(".war-hit").attr("title") !== "War bonus: None") {
                                        $(this).css({ backgroundImage: `url(${WORST_FF})` });
                                    } else {
                                        // Ignores any "#1" single digit numbers and flags any poop with double digits or more
                                        if (2 < $(this).find(".attack-number").text().length) {
                                            $(this).css({ backgroundImage: `url(${WORST_FF})` });
                                        } else {
                                            $(this).css({ backgroundColor: '#261d01' });
                                        }
                                    }
                                }
                            }
                            success = true;
                        }
                    }
                } else {
                    success = true;
                }

                if (success) {
                    $(this).addClass("ff_processed");
                }
            }
        });
    }

    function clear_colours() {
        $(".chain-attacks-list").children("li").each(function () {
            if ($(this).hasClass("ff_processed")) {
                $(this).removeClass("ff_processed");
                $(this).css({ backgroundImage: "" });
                $(this).css({ backgroundColor: "" });
            }
        });
    }

    // Make the chain hits highlight FF3.0 hits
    var chain_colour_enabled = rD_getValue("chain_colour", "true");
    function make_pretty() {
        var chain_title = $(".chain-attacks-title")[0]
        if (chain_title) {

            if (!$("#chain_colour_button").length) {
                // No button exists, create one
                var colour_button = document.createElement('div');
                colour_button.id = "chain_colour_button";
                colour_button.style.display = 'flex'; // Use flexbox for centering
                colour_button.style.cursor = 'pointer'; // Change cursor to pointer
                colour_button.addEventListener('click', () => {
                    if (chain_colour_enabled === "true") {
                        rD_setValue("chain_colour", "false");
                        chain_colour_enabled = "false";
                        console.log("Removing colours");
                        clear_colours();
                    } else {
                        rD_setValue("chain_colour", "true");
                        chain_colour_enabled = "true";
                        console.log("Setting colours");
                        set_colours();
                    }
                });

                const textNode = document.createTextNode("Toggle colours");
                textNode.id = "chain_colour_toggle";
                colour_button.appendChild(textNode);
                chain_title.appendChild(colour_button);
            }

            if (chain_colour_enabled === "true") {
                set_colours();
            } else {
                clear_colours();
            }
        }
    }

    if (window.location.href.startsWith("https://www.torn.com/factions.php?step=your")) {
        const torn_observer = new MutationObserver(function () {
            make_pretty(torn_observer);
        });

        torn_observer.observe(document, { attributes: false, childList: true, characterData: false, subtree: true });
    }
    if (!key) {
        set_message("Limited API key needed - click to add");
    }
}
else {
    // console.log("Did not match against " + window.location.href);
}

function get_player_id_in_element(element) {
    const anchors = element.getElementsByTagName('a');

    for (const anchor of anchors) {
        const match = anchor.href.match(/.*XID=(?<target_id>\d+)/);
        if (match) {
            return match.groups.target_id;
        }
    }

    return null;
}

function get_ff_low(target_id) {
    var cached_ff_response = rD_getValue("" + target_id, null);
    try {
        cached_ff_response = JSON.parse(cached_ff_response);
    }
    catch {
        cached_ff_response = null;
    }

    if (cached_ff_response) {
        return cached_ff_response.ff_low;
    }
    return null;
}

function ff_to_percent(ff) {
    // There are 3 key areas, low, medium, high
    // Low is 1-2
    // Medium is 2-4
    // High is 4+
    // If we clip high at 8 then the math becomes easy
    // The percent is 0-40% 40-80% 80%-100%
    const low_ff = 1.8;
    const high_ff = 4;
    const low_mid_percent = 40;
    const mid_high_percent = 80;
    ff = Math.min(ff, 8)
    if (ff < low_ff) {
        return (ff - 1) / (low_ff - 1) * low_mid_percent;
    } else if (ff < high_ff) {
        return (((ff - low_ff) / (high_ff - low_ff)) * (mid_high_percent - low_mid_percent)) + low_mid_percent;
    } else {
        return (((ff - high_ff) / (8 - high_ff)) * (100 - mid_high_percent)) + mid_high_percent;
    }
}

function show_cached_values(elements) {
    for (const [player_id, element] of elements) {
        element.classList.add('ff-scouter-indicator');

        if (!element.classList.contains('ff-scouter-vertical-line-low-upper')) {
            const ff_low = get_ff_low(player_id);
            if (ff_low) {
                $(element).append($("<div>", { class: "ff-scouter-vertical-line-low-upper" }));
                $(element).append($("<div>", { class: "ff-scouter-vertical-line-low-lower" }));
                $(element).append($("<div>", { class: "ff-scouter-vertical-line-high-upper" }));
                $(element).append($("<div>", { class: "ff-scouter-vertical-line-high-lower" }));
                $(element).append($("<div>", { class: "ff-scouter-indicator-upper" }));
                $(element).append($("<div>", { class: "ff-scouter-indicator-lower" }));
                const img = $('<img>', {
                    src: "https://torn.rdacted.com/static/target2.png",
                    class: "ff-scouter-target",
                });
                $(element).append(img);

                element.style.setProperty("--band-percent", ff_to_percent(ff_low));
                element.style.setProperty("--band-width", "16px");
            }
        }
    }
}

async function apply_ff_gauge(elements) {
    console.log("eval");
    // Remove elements which already have the class
    elements = elements.filter(e => !e.classList.contains('ff-scouter-indicator'));
    // Convert elements to a list of tuples
    elements = elements.map(e => {
        const player_id = get_player_id_in_element(e);
        return [player_id, e];
    });
    // Remove any elements that don't have an id
    elements = elements.filter(e => e[0]);

    if (elements.length > 0) {
        // Display cached values immediately
        // This is also important to ensure we only iterate the list once
        // Then update
        // Then re-display after the update
        show_cached_values(elements);
        const player_ids = elements.map(e => e[0]);
        update_ff_cache(player_ids, () => { show_cached_values(elements); });
    }
}

// Display the FF gauge

const ff_gauge_observer = new MutationObserver(async function () {
    if (window.location.href.startsWith("https://www.torn.com/factions.php")) {
        await apply_ff_gauge($(".member").toArray());
    }
});

ff_gauge_observer.observe(document, { attributes: false, childList: true, characterData: false, subtree: true });



if (key) {
    const settings = $(".settings-menu > li > a > :contains(Settings)")[0].parentNode?.parentNode;
    if (settings) {
        const ff_benefits = settings.cloneNode(true);
        const ff_benefits_a = $("a", ff_benefits)[0];
        ff_benefits_a.href = `${BASE_URL}/ff_scouter/index.html?api_key=${key}`;
        ff_benefits_a.target = "_blank";
        $("span", ff_benefits)[0].innerText = "FF Scouter Extras";

        settings.parentNode?.insertBefore(ff_benefits, settings.nextSibling);
    }
}
