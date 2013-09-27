/**
 * The MIT License (MIT)

 Copyright (c) Dmitri Snytkine

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */
/**
 * Created by Dmitri Snytkine
 * Logic for rendering data in browser action popup window
 * of the extension.
 *
 */
var bgpage = chrome.extension.getBackgroundPage();

var showAlert = function (s) {
    var tpl = '<div class="alert alert-danger">' + s + '</div>';
    $("#popup_ui_main").html(tpl);
}

/**
 * Format time interval
 * into a string like
 * 2h 5m 23s
 *
 * @param int i number of milliseconds
 * @param string itype optional if 'm' then the i was given in minutes in not in milliseconds
 * @return string formatted time interval string
 */
var formatInterval = function (i, itype) {
    var h, m, s, ret = "";

    if (itype === 'm') {
        s = i * 60;
    } else {
        /**
         * Get rid of milliseconds
         */
        s = parseInt((i / 1000), 10);
    }
    /**
     * If over 3600 seconds
     * format into h, m, s
     */
    if (s >= 3600) {
        h = parseInt(s / 3600);
        /**
         * If only exact hours
         * return only number of hours
         */
        if (s % 3600 === 0) {

            return h + 'h';
        }

        m = parseInt((s - (h * 3600)) / 60);
        s = s % 60;

        ret += h + 'h ' + m + 'm';
        /**
         * Append number of seconds in there
         * are any, otherwise will return only
         * hours and minutes
         */
        if (s > 0) {
            ret += " " + s + "s";
        }

        return ret;

    } else if (s >= 60) {
        /**
         * Only m, s
         */
        m = parseInt(s / 60);
        s = s % 60;

        ret += m + 'm';
        /**
         * Append number of seconds only
         * if there are any, otherwise
         * return only number of minutes
         */
        if (s > 0) {
            ret += " " + s + "s";
        }
        return ret;
    }

    /**
     * Less than 60 seconds, only return
     * number of seconds
     * If timer goes below 0 return 0
     * we don't want to show negative time
     */
    ret = (s > 0) ? s : 0;

    return ret + "s";
}

/**
 * Render html table
 * with details about running background processes.
 *
 * @param procs object RunningProcs
 */
var showProcs = function renderTable(procs, foregroundRules) {
    console.log("WILL SHOW running procs");
    console.log("TOTAL RUNNING PROCS: " + procs.size());

    var show_running = '<div class="panel panel-default">'
    show_running += '<div class="panel-heading">Background requests</div>';
    show_running += '<div class="panel-body"><p>Currently running background requests</p></div>';
    show_running += '<table class="table table-condensed running_procs">';
    show_running += '<thead><tr id="mthead">';
    show_running += '<th class="rp_rule">Rule</th>';
    show_running += '<th class="rp_int">Interval</th>';
    show_running += '<th class="rp_next">Next run</th>';
    show_running += '<th class="rp_count">Count</th>';
    show_running += '<th class="rp_end">End</th>';
    show_running += '</tr></thead><tbody>';

    var end_running = '</tbody></table></div>';
    /**
     * RunningRule
     */
    var rr;
    /**
     * DomainRule
     */
    var dr;


    for (var p in procs.hashMap) {
        if (procs.hashMap.hasOwnProperty(p)) {
            rr = procs.hashMap[p]
            dr = rr['rule'];
            show_running += '<tr id="' + dr.id + '" start_time="' + rr.initTime + '">';
            show_running += '<td><span class="rule_name" rel="tooltip" data-toggle="tooltip" title="' + dr.getLoopUri() + '"><a href="settings.html?id=' + dr.id + '" target="_rule_settings">' + dr.ruleName + '</a></span></td>';
            show_running += '<td class="rule_interval">' + formatInterval(dr.getInterval(), "m") + '</td>';
            show_running += '<td class="next_run">' + formatInterval(rr.getNextRunTime()) + '</td>';
            show_running += '<td><span class="counter">' + rr.counter + '</span></td>';
            show_running += '<td><button type="button" rel="tooltip" data-toggle="tooltip" title="Cancel rule" class="cancel_rule" rule_id="' + dr.id + '" >';
            show_running += '<span></span></button></td></tr>';
        }
    }

    /**
     * Now foreground rules
     */
    for (var f in foregroundRules) {
        if (foregroundRules.hasOwnProperty(f)) {
            rr = foregroundRules[f]
            dr = rr['rule'];
            show_running += '<tr id="fg_' + dr.id + '" class="fg_rule">';
            show_running += '<td><span class="rule_name" rel="tooltip" data-toggle="tooltip" title=""><a href="settings.html?id=' + dr.id + '" target="_rule_settings">' + dr.ruleName + '</a></span></td>';
            show_running += '<td class="rule_interval">' + formatInterval(dr.fgTimeout, "m") + '</td>';
            show_running += '<td class="next_run">' + formatInterval(rr.getNextRunTime()) + '</td>';
            show_running += '<td><span class="counter">' + rr.counter + '</span></td>';
            show_running += '<td><button type="button" rel="tooltip" data-toggle="tooltip" title="Cancel rule" class="cancel_rule" rule_id="fg_' + dr.id + '" >';
            show_running += '<span></span></button></td></tr>';
        }
    }

    $("#popup_ui_main").html(show_running + end_running);
}

/**
 * Update only specific cells in existing table
 * without recreating the table
 *
 * @param procs
 */
var updateTable = function (procs, foregroundRules) {
    var tr, rr, dr, i = 0;
    for (var p in procs.hashMap) {
        if (procs.hashMap.hasOwnProperty(p)) {
            i += 1;
            rr = procs.hashMap[p]
            dr = rr['rule'];

            tr = $("#" + dr.id);

            if (tr.length > 0) {
                tr.find("td.rule_name").attr(dr.getLoopUri());
                tr.find("td.rule_interval").html(formatInterval(dr.getInterval(), "m"));
                tr.find("td.next_run").html(formatInterval(rr.getNextRunTime()));
                tr.find("span.counter").html(rr.counter);
            } else {
                /**
                 * If new RunningRule was added while the popup
                 * window is open - this rule was not in the html table yet,
                 * we need to append new row for it.
                 * This is the case when while popup window is opened
                 * the uri is entered in active tab and that uri matched
                 * one of the rules, thus added to runningProcs object
                 */
                tr = "";
                tr += '<tr id="' + dr.id + '" start_time="' + rr.initTime + '">';
                tr += '<td><span class="rule_name" rel="tooltip" data-toggle="tooltip" title="' + dr.getLoopUri() + '"><a href="settings.html?id=' + dr.id + '" target="_rule_settings">' + dr.ruleName + '</a></span></td>';
                tr += '<td class="rule_interval">' + formatInterval(dr.getInterval(), "m") + '</td>';
                tr += '<td class="next_run">' + formatInterval(rr.getNextRunTime()) + '</td>';
                tr += '<td><span class="counter">' + rr.counter + '</span></td>';
                tr += '<td><button type="button" rel="tooltip" data-toggle="tooltip" title="Cancel rule" class="cancel_rule" rule_id="' + dr.id + '" >';
                tr += '<span></span></button></td>';
                tr += '</tr>';

                $("table.running_procs > tbody").append(tr);
            }
        }

    }

    /**
     * Now foreground rules
     */
    for (var f in foregroundRules) {
        if (foregroundRules.hasOwnProperty(f)) {
            i += 1;
            rr = foregroundRules[f]
            dr = rr['rule'];
            tr = $("#fg_" + dr.id);

            if (tr.length > 0) {
                //tr.find("td.rule_name").attr(dr.getLoopUri());
                tr.find("td.rule_interval").html(formatInterval(dr.fgTimeout, "m"));
                tr.find("td.next_run").html(formatInterval(rr.getNextRunTime()));
                tr.find("span.counter").html(rr.counter);
            } else {
                /**
                 * If new RunningRule was added while the popup
                 * window is open - this rule was not in the html table yet,
                 * we need to append new row for it.
                 * This is the case when while popup window is opened
                 * the uri is entered in active tab and that uri matched
                 * one of the rules, thus added to runningProcs object
                 */
                tr = "";
                tr += '<tr id="fg_' + dr.id + '" class="fg_rule">';
                tr += '<td><span class="rule_name" rel="tooltip" data-toggle="tooltip" title=""><a href="settings.html?id=' + dr.id + '" target="_rule_settings">' + dr.ruleName + '</a></span></td>';
                tr += '<td class="rule_interval">' + formatInterval(dr.fgTimeout, "m") + '</td>';
                tr += '<td class="next_run">' + formatInterval(rr.getNextRunTime()) + '</td>';
                tr += '<td><span class="counter">' + rr.counter + '</span></td>';
                tr += '<td><button type="button" rel="tooltip" data-toggle="tooltip" title="Cancel rule" class="cancel_rule" rule_id="fg_' + dr.id + '" >';
                tr += '<span></span></button></td>';
                tr += '</tr>';

                $("table.running_procs > tbody").append(tr);
            }

        }
    }

    /**
     * If RunningRule has been removed from runningProcs
     * but is still in the html table we must remove that tr element from table.
     * This would be the case if tab is closed or bad http response received
     * from server while the popup window is open, in this case
     * the rule is no longer in runningProcs but will still show up
     * in html table and the next run value will not be counting down
     *
     */
    if ($('tr').length > (i + 1)) {
        d("Need to remove tr from table");
        $('tr').each(function () {
            var trId, e = $(this);
            trId = e.attr('id');
            /**
             * Do NOT remove header row!
             * Check for id mthead!
             */
            if (trId !== 'mthead') {
                if (!procs.getRuleById(trId) && !foregroundRules.hasOwnProperty(trId.substring(2))) {
                    d("Removing tr with id: " + trId);
                    e.remove();
                } else {
                    d("tr with id " + trId + " found in procs");
                }
            }
        })
    }
}

/**
 * Update the popup window
 * Will show error message if no domain rules or no running procs
 * If there are any running background processes
 * will render html table with details
 *
 * @param runningProcs
 * @param domainRules
 * @param oneTimeOnly
 */
var updatePopup = function update(oneTimeOnly) {

    var dr = bgpage.DOMAIN_RULES, procs = bgpage.runningProcs, foregroundRules = bgpage.foregroundRules;

    console.log("foregroundRules: " + JSON.stringify(foregroundRules));

    if (dr && dr.length < 1) {
        showAlert("You have not setup any rules for running background processes. Click on the Settings link above to add new rules");
        return;
    }

    if (procs.size() < 1) {
        showAlert("There are no background requests running at this time. Click on Settings button above to view or add background rules");

        return;
    }

    if ($("table.running_procs").length > 0) {
        updateTable(procs, foregroundRules);
    } else {
        d("Will render new table");
        showProcs(procs, foregroundRules);
    }

    /**
     * Schedule to run this function
     * again in 1 second.
     */
    if (!oneTimeOnly) {
        setTimeout(function () {
            update();
        }, 1000);
    }
}

$(function () {
    console.log("POPUP INITIALIZED");

    updatePopup();

    /**
     * This is important to properly
     * render bootstrap's tooltip
     */
    $('body').tooltip({
        selector: '[rel=tooltip]'
    });

    /**
     * Subscribe to click on close icon
     * to close browser popup
     */
    $(".my_close").click(function () {
        window.close()
    });

    /**
     * Subscribe to click on "End process" icon
     * will remove process from runningProcs
     * and re-render the popup window view immediately
     */
    $("#popup_ui_main").delegate("button.cancel_rule", "click", function () {
        var id = $(this).attr("rule_id");
        console.log("Cancelling rule " + id);
        bgpage.removeRunningRuleById(id);
        updatePopup(true);
    });
})

