/**
 * Created with JetBrains PhpStorm.
 * User: admin
 * Date: 9/21/13
 * Time: 11:44 AM
 * To change this template use File | Settings | File Templates.
 */

(function () {

    var reloadTime,
        reloadInterval,
        init,
        showCountdownAlert,
        stopReload,
        startCountdownToAlert,
        myInner,
        alertDiv,
        startCountdownAlert;

    /**
     * Start counting down number of seconds
     * in which to show alert with alert's own countdown timer
     *
     * @param int t number of seconds till alert
     */
    startCountdownToAlert = function (t) {
        if (!t) {
            throw new Error("value of timeout t not passed");
        }

        if (t < 60) {
            throw new Error("Muminum value of timeout is 60 seconds. Passed: " + t);
        }

        setTimeout(showCountdownAlert, t * 1000);
    }

    startCountdownAlert = function updateCounter(s) {
        var seconds = (s || s === 0) ? s : 29;
        if (seconds >= 0) {
            setTimeout(function () {
                var counter = document.getElementById("session_live_reloader_countdown");
                if (counter) {
                    if (seconds < 11) {
                        counter.style.backgroundColor = "#d9534f";
                    } else {
                        counter.style.backgroundColor = "#999999";
                    }

                    counter.innerText = seconds;
                }
                updateCounter(seconds - 1);
            }, 1000);
        } else {
            if (alertDiv.style.display != "none") {
                //window.location.reload(true);
            }
        }
    }

    showCountdownAlert = function () {
        document.getElementById("session_live_reloader_countdown").innerText = "30";
        alertDiv.style.display = "block";
        startCountdownAlert();
    }

    /**
     * User clicked on Cancel button to stop reload of page
     *
     */
    stopReload = function () {
        var alertDiv, counterSpan;
        alertDiv = document.getElementById("ext_session_alive_reload_prompt");
        counterSpan = document.getElementById("session_live_reloader_countdown");
        if (alertDiv && counterSpan) {
            alertDiv.style.display = "none";
            /**
             * Re-schedule alert to reappear in 1 minute
             */
            startCountdownToAlert(60);
        }
    }

    /**
     * Setup master interval,
     * add alert div into document dom
     * initially with display "none"
     */
    init = function () {

        alertDiv = document.createElement("div");
        alertDiv.id = "ext_session_alive_reload_prompt";
        alertDiv.style.display = "none";
        myInner = '<div><div>To Keep Your Session Active<br>page will reload in <span id="session_live_reloader_countdown">30</span> seconds';
        myInner += '<br><a href="' + chrome.extension.getURL("settings.html") + '">Edit Rule</br></a>';
        myInner += '</div><div><button type="button" id="ext_session_alive_reload_cancel">Wait 1 minute</button></div></div>';

        document.body.appendChild(alertDiv);
        alertDiv.innerHTML = myInner;

        document.getElementById("ext_session_alive_reload_cancel").addEventListener("click", function () {
            stopReload();
        });

        chrome.runtime.sendMessage({getConfig: "reloadTimer"}, function (response) {
            var initInterval;
            if (response && response.reloadVal) {
                reloadTime = parseInt(response.reloadVal, 10);
                if (reloadTime > 0) {
                    /**
                     * Convert reloadTime into milliseconds
                     * then subtract 30 seconds.
                     * End-result is: If desired page refresh interval is
                     * 5 minutes then we set interval to 4 minutes and 30 seconds
                     * knowing that actual reload will happen after the alert is shown
                     * to user for 30 seconds, giving the user opportunity
                     * to cancel the reload
                     * In case user cancels the reload the interval is still running
                     * and will show the same alert in 4 and half minutes after
                     * the first alert is shown.
                     *
                     */
                    initInterval = (reloadTime * 60000) - 30000;
                }
            }
        });

        //reloadInterval = setInterval(showCountdownAlert, 35000);
        showCountdownAlert();
    }

    init();
})();
