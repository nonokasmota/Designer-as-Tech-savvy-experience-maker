// === Config ===
const DOT_LIFETIME_MS = 60 * 1000; // 1 minute
const dotColor = 0xffffff;
let zOffset = 0;
let previousZOffset = 0;  // Store the previous zOffset for smoothing
let rotationY = 0;
let smoothedRotationY = 0;  // For smoother rotation
const dotRadius = 0.0004; // Tiny dot radius

// === Three.js Setup ===
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === Line Logic with Dots ===
const positions = [];
let dots = [];  // Store all dot meshes for easy removal
let lineGeometry = new THREE.BufferGeometry(); // Geometry for the line
let lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
let line; // The line mesh

const dotMaterial = new THREE.MeshBasicMaterial({ color: dotColor });
const dotGeometry = new THREE.SphereGeometry(dotRadius, 8, 8);

// Create an empty line object initially
function createLine() {
  line = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(line);
}

function updateLine() {
  // Update line geometry
  const positionArray = [];
  positions.forEach((position) => {
    positionArray.push(position.x, position.y, position.z);
  });

  // Set new positions in the line geometry
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3));
  lineGeometry.needsUpdate = true;
}

function updateDots() {
  while (dots.length > 0) {
    const dot = dots.pop();
    scene.remove(dot);
  }

  positions.forEach((position) => {
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.copy(position);
    scene.add(dot);
    dots.push(dot);
  });
}

function addPointToLine(x, y, z) {
  const ndcX = (x / window.innerWidth) * 2 - 1;
  const ndcY = -(y / window.innerHeight) * 2 + 1;
  const vector = new THREE.Vector3(ndcX, ndcY, z).unproject(camera);

  positions.push(vector);
  if (positions.length > 100) {
    positions.shift();
  }

  updateDots(); // Update dots
  updateLine(); // Update line geometry
}

document.addEventListener('mousemove', (event) => {
  const adjustedZOffset = zOffset + 0.0001;
  addPointToLine(event.clientX, event.clientY, adjustedZOffset);
});

// === Animate ===
function animate() {
  scene.rotation.y = smoothedRotationY;
  renderer.render(scene, camera);
}

// === Face Tracking ===
const video = document.getElementById('webcam');
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(results => {
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const nose = results.multiFaceLandmarks[0][1]; // Nose tip landmark
    const normalizedX = nose.x * 2 - 1;
    const normalizedY = nose.y * 2 - 1; // Normalize the Y position (vertical)

    rotationY = -normalizedX * Math.PI / 256;

    const smoothingFactor = 0.5;
    smoothedRotationY = smoothedRotationY + (rotationY - smoothedRotationY) * smoothingFactor;
    const maxRotation = Math.PI / 16;
    smoothedRotationY = Math.max(-maxRotation, Math.min(smoothedRotationY, maxRotation));

    // Zoom based on nose Y-axis position with a smaller zoom effect
    const zoomSensitivity = 0.1; // Smaller zoom sensitivity
    camera.position.z = 5 + (normalizedY * zoomSensitivity); // Update zoom based on head tilt

    // Update rotation text
    const rotationElement = document.getElementById('face-rotation');
    const recallInventElement = document.getElementById('recall-invent');
    const rightLeftElement = document.getElementById('right-left');

    rotationElement.textContent = smoothedRotationY.toFixed(5);
    recallInventElement.textContent = smoothedRotationY > 0 ? "Recalling" : "Inventing";
    rightLeftElement.textContent = smoothedRotationY > 0 ? "Right" : "Left";

    // ✅ Restore Face Distance Calculation
    document.getElementById('face-distance').textContent = `${(nose.z * 100).toFixed(3)}`;
    const distance = Math.abs(nose.z);
    faceDistance = distance;
    document.getElementById('closeness-level').textContent = `${(faceDistance * 100).toFixed(3)}`;
    if (distance < 4) {
      document.getElementById('good-bad-sight').textContent = 'Good Sight';
    } else if (distance < 6) {
      document.getElementById('good-bad-sight').textContent = 'Okay Sight';
    } else {
      document.getElementById('good-bad-sight').textContent = 'Bad Sight';
    }

    // ✅ Update zOffset for depth perception
    zOffset = Math.max(0.1, Math.min(distance * 10, 5));
    zOffset = zOffset * 0.8 + previousZOffset * 0.2;
    previousZOffset = zOffset;
  }
});

const cameraUtils = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({ image: video });
  },
  width: 640,
  height: 480
});
cameraUtils.start();

// === System Information ===
fetch('https://api.ipify.org?format=json')
  .then(response => response.json())
  .then(data => {
    document.getElementById('ip-address').textContent = `${data.ip}`;
  })
  .catch(error => {
    console.error('Error fetching IP address:', error);
    document.getElementById('ip-address').textContent = 'BLOCKED.IP';
  });

function checkDeviceStatus() {
  navigator.mediaDevices.enumerateDevices().then(devices => {
    devices.forEach(device => {
      if (device.kind === 'videoinput') {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            updateCameraStatus(true);
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(() => {
            updateCameraStatus(false);
          });
      }
      if (device.kind === 'audioinput') {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            updateMicStatus(true);
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(() => {
            updateMicStatus(false);
          });
      }
    });
  });
}

function updateCameraStatus(isOn) {
  document.getElementById('camera-status').textContent = `${isOn ? 'ON' : 'OFF'}`;
}

function updateMicStatus(isOn) {
  document.getElementById('mic-status').textContent = `${isOn ? 'ON' : 'OFF'}`;
}

window.onload = checkDeviceStatus;

function getOS() {
  const platform = navigator.platform;
  if (platform.includes('Win')) return 'Windows';
  if (platform.includes('Mac')) return 'MacOS';
  if (platform.includes('Linux')) return 'Linux';
  if (platform.includes('Android')) return 'Android';
  if (platform.includes('iPhone') || platform.includes('iPad')) return 'iOS';
  return 'Unknown OS';
}

function getBrowser() {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  return 'Unknown Browser';
}

function getDeviceType() {
  const width = window.innerWidth;
  if (width <= 768) return 'Mobile';
  if (width <= 1024) return 'Tablet';
  return 'Desktop';
}

function displaySystemInfo() {
  document.getElementById('os-info').textContent = `${getOS()}`;
  document.getElementById('browser-info').textContent = `${getBrowser()}`;
  document.getElementById('device-info').textContent = `${getDeviceType()}`;
}

displaySystemInfo();

function updateScreenSize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  document.getElementById('screen-size').textContent = `${width}*${height}`;
}

function howMuchTimeIsSiteOpen() {
  const startTime = Date.now();
  document.getElementById('time-spent').textContent = '00:00:00:00';

  const hours = new Date().getHours();
  const timeOfDay = hours >= 6 && hours < 18 ? 'DayTime' : 'NightTime';
  document.getElementById('time-of-day').textContent = timeOfDay;

  setInterval(() => {
    const elapsedTime = Date.now() - startTime;
    const milliseconds = Math.floor((elapsedTime % 1000) / 10);
    const seconds = Math.floor((elapsedTime / 1000) % 60);
    const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
    const hours = Math.floor((elapsedTime / (1000 * 60 * 60)) % 24);

    document.getElementById('time-spent').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
  }, 100);
}
howMuchTimeIsSiteOpen();

updateScreenSize();
window.addEventListener('resize', updateScreenSize);

document.addEventListener('mousemove', (event) => {
  document.getElementById('cursor-position').textContent = `${event.clientX}/ ${event.clientY}`;
});

function monitorMicDecibelLevel() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const dataArray = new Float32Array(analyser.fftSize);

    analyser.fftSize = 256;
    microphone.connect(analyser);

    function updateDecibelLevel() {
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]; // Square the amplitude
      }
      const rms = Math.sqrt(sum / dataArray.length); // Root Mean Square
      let decibelLevel = 20 * Math.log10(rms); // Convert to decibels
      decibelLevel = Math.abs(decibelLevel);
      decibelLevel = decibelLevel - 80;
      if (decibelLevel < 0) decibelLevel *= -1; // Avoid negative values
      if (decibelLevel > 100) decibelLevel = 100; // Cap at 100 dB

      if (decibelLevel > 30) {
        document.getElementById('silent-talking').textContent = '';
        document.getElementById('silent-talking').textContent = 'Talking';
      } else {
        document.getElementById('silent-talking').textContent = '';
        document.getElementById('silent-talking').textContent = 'Silent';
      }


      document.getElementById('noise-level').textContent = `${decibelLevel.toFixed(2)}`;
      requestAnimationFrame(updateDecibelLevel);
    }

    updateDecibelLevel();
  }).catch((error) => {
    console.error('Error accessing microphone:', error);
    document.getElementById('noise-level').textContent = 'Error';
  });
}

// Call the function to start monitoring decibel level
monitorMicDecibelLevel();

// === Initialize the line when the page loads ===
createLine();

// === Track Last Word ===
function trackLastWord() {
  const inputField = document.getElementById('dynamicInput');
  let lastWord = '';

  inputField.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); // Prevent default behavior of space/enter
      lastWord = inputField.value.trim(); // Save the last word
      if (lastWord) {
        const lastWordElement = document.getElementById('last-input');
        lastWordElement.textContent = `${lastWord}`; // Update the last word display
      }
      inputField.value = ''; // Clear the input field
    }
  });
}

// Call the function to start tracking the last word
trackLastWord();

// === Calculate Dynamic WPM ===
function calculateDynamicWPM() {
  const inputField = document.getElementById('dynamicInput');
  const wpmDisplay = document.getElementById('wpm');
  let wordCount = 0;
  let startTime = null;

  inputField.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); // Prevent default behavior of space/enter


      wordCount++;



      if (!startTime) {
        startTime = Date.now(); // Start the timer when the first word is entered
      }

      const elapsedTime = (Date.now() - startTime) / 1000; // Convert to seconds
      const minutesElapsed = elapsedTime / 60; // Convert to minutes

      const wpm = minutesElapsed > 0 ? Math.round(wordCount / minutesElapsed) : 0;
      if (wpm > 500) {
        document.getElementById('knowledge').textContent = 'Tech Savy';
      } else if (wpm > 300) {
        document.getElementById('knowledge').textContent = 'Tech Aware';
      } else if (wpm > 200) {
        document.getElementById('knowledge').textContent = 'Tech Noob';
      }

      wpmDisplay.textContent = `${wpm}`; // Update WPM display dynamically
    }
  });
}

function getHour() {
  const date = new Date();
  const hours = date.getHours();
  return hours;
}
function getMinute() {
  const date = new Date();
  const minutes = date.getMinutes();
  return minutes;
}
function getSecond() {
  const date = new Date();
  const seconds = date.getSeconds();
  return seconds;
}

function getmillisecond() {
  const date = new Date();
  const milliseconds = date.getMilliseconds();
  return milliseconds;
}

function getDay() {
  const date = new Date();
  const day = date.getDate();
  return day;
}
function getMonth() {
  const date = new Date();
  const month = date.getMonth() + 1; // Months are zero-indexed
  return month;
}
function getYear() {
  const date = new Date();
  const year = date.getFullYear();
  return year;
}

function overlayAction() {
  const overlays = document.getElementsByClassName('overlayToHide'); // Access all elements with the class
  Array.from(overlays).forEach((overlay) => {
    if (overlay.style.color === 'transparent' && overlay.style.backgroundColor === 'transparent') {
      overlay.style.color = '';
      overlay.style.backgroundColor = '';
    } else {
      overlay.style.color = 'transparent';
      overlay.style.backgroundColor = 'transparent';
    }
  });

  const overlayButton = document.getElementById('overlay-button');
  overlayButton.textContent = overlays[0].style.display === 'none' ? 'Open[A]' : 'Close[A]';
}


function buildDate() {
  text = '';
  //YYYYMMDD_hhmmssxx
  text += getYear();
  text += getMonth().toString().padStart(2, '0');
  text += getDay().toString().padStart(2, '0');
  text += '_';
  text += getHour().toString().padStart(2, '0');
  text += getMinute().toString().padStart(2, '0');
  text += getSecond().toString().padStart(2, '0');
  text += getmillisecond().toString().padStart(2, '0');

  const element = document.getElementById('clock');
  element.textContent = text; // Update the last word display


}

buildDate();
setInterval(buildDate, 100);

// Call the function to start calculating dynamic WPM
calculateDynamicWPM();