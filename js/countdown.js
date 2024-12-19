document.addEventListener("DOMContentLoaded", function () {
  // Get the target datetime
  // nonlocal const targetDatetime;

  // Get the countdown elements
  const countdown = document.getElementById("countdown");
  const daysElement = document.getElementById("countdown-days");
  const hoursElement = document.getElementById("countdown-hours");
  const minutesElement = document.getElementById("countdown-minutes");
  const secondsElement = document.getElementById("countdown-seconds");

  // Update the countdown every second
  const countdownInterval = setInterval(updateCountdown, 1000);
  updateCountdown();

  function updateCountdown() {
    // Get the current datetime
    const currentDatetime = new Date();

    // Calculate the remaining time
    const remainingTime = targetDatetime - currentDatetime;

    if (remainingTime < 0) {
      // If the remaining time is negative, stop the countdown
      clearInterval(countdownInterval);
      countdown.classList.add("d-none");
      document.getElementById("countdown-ended").classList.remove("d-none");
      return;
    }

    // Calculate the days, hours, minutes, and seconds
    const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

    // Update the countdown elements
    daysElement.textContent = days;
    hoursElement.textContent = ('0'+hours).slice(-2);
    minutesElement.textContent = ('0'+minutes).slice(-2);
    secondsElement.textContent = ('0'+seconds).slice(-2);
  }
});