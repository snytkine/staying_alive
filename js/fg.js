/**
 * Created with JetBrains PhpStorm.
 * User: admin
 * Date: 9/21/13
 * Time: 11:44 AM
 * To change this template use File | Settings | File Templates.
 */

(function () {

    var reloadInterval,
        init,
        showCountdownAlert,
        stopReload,
        myInner,
        alertDiv,
        startCountdownAlert;

    startCountdownAlert = function updateCounter(s) {
        var seconds = (s || s === 0) ? s : 29;
        if (seconds >= 0) {
            setTimeout(function () {
                document.getElementById("session_live_reloader_countdown").innerText = seconds;
                updateCounter(seconds - 1);
            }, 1000);
        } else {
            if (alertDiv.style.display != "none") {
                // cancel interval
                if (reloadInterval || reloadInterval === 0) {
                    //console.log("Clearing reloadInterval");
                    clearInterval(reloadInterval);
                }
                //window.location.reload(true);
                //chrome.tabs.getCurrent();
                //chrome.tabs.reload();
            } else {
                //console.log("alertDiv is hidden");
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
        myInner = '<div><div>To Keep Your Session Active<br>page will reload in <span id="session_live_reloader_countdown">30</span> seconds</div>';
        myInner += '<div><button type="button" id="ext_session_alive_reload_cancel">Cancel</button></div></div>';

        document.body.appendChild(alertDiv);
        alertDiv.innerHTML = myInner;

        document.getElementById("ext_session_alive_reload_cancel").addEventListener("click", function () {
            stopReload();
        });

        //reloadInterval = setInterval(showCountdownAlert, 35000);
        showCountdownAlert();
    }

    init();
})();
