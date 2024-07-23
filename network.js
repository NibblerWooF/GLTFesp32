const SEND_INTERVAL = 50; // 发送间隔时间（毫秒）
const MAX_ANGLE_CHANGE = 3; // 每次允许的最大角度变化值

function connectWebSocket() {
    console.log('Attempting to connect to WebSocket...');
    websocket = new WebSocket('ws://192.168.4.1:81');

    websocket.onopen = function(evt) {
        document.getElementById('connection-status').innerText = 'Connected';
        console.log('WebSocket connected');
    };

    websocket.onclose = function(evt) {
        document.getElementById('connection-status').innerText = 'Not connected';
        console.log('WebSocket disconnected', evt);
    };

    websocket.onmessage = function(evt) {
        log(`Received text: ${evt.data}`);
        console.log(`Received text: ${evt.data}`);
    };

    websocket.onerror = function(evt) {
        console.error('WebSocket error:', evt);
    };
}

function log(message) {
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += `<p>${message}</p>`;
}

function sendAngleToESP32(boneName, axis, angle) {
    const currentTime = Date.now();
    if (currentTime - lastSendTime < SEND_INTERVAL) {
        return; // 如果未达到发送间隔时间，则不发送
    }

    angle = Math.round(Math.abs(parseFloat(angle))); // 确保角度是整数
    if (isNaN(angle) || angle < 0 || angle > 180) {
        console.error(`Invalid angle: ${angle} for bone: ${boneName}`);
        return;
    }

    // 检查和限制角度变化速率
    if (previousAngle !== null) {
        const angleChange = Math.abs(angle - previousAngle);
        if (angleChange > MAX_ANGLE_CHANGE) {
            angle = previousAngle + Math.sign(angle - previousAngle) * MAX_ANGLE_CHANGE;
        }
    }
    previousAngle = angle;

    if (websocket && websocket.readyState === WebSocket.OPEN) {
        const message = `${boneName} ${axis} ${angle}`;
        console.log('Preparing to send to ESP32:', message);
        try {
            websocket.send(message);
            lastSendTime = currentTime; // 记录最后发送时间
            console.log('Sent to ESP32:', message);
        } catch (error) {
            console.error('Error sending message to ESP32:', error);
            setTimeout(() => {
                sendAngleToESP32(boneName, axis, angle); // 重试发送
            }, 100); // 100毫秒后重试
        }
    } else {
        console.warn('WebSocket is not open.');
    }
}


function sendInterpolatedAngles(boneName, axis, startAngle, endAngle) {
    const angles = [];
    const steps = Math.abs(endAngle - startAngle);
    for (let i = 0; i <= steps; i++) {
        angles.push(lerp(startAngle, endAngle, i / steps));
    }

    console.log(`Generated angles for ${boneName} ${axis}:`, angles);

    angles.forEach((angle, index) => {
        setTimeout(() => {
            sendAngleToESP32(boneName, axis, angle);
        }, SEND_INTERVAL * index);
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const contents = e.target.result;
        loadModel(contents, true);
    };
    reader.readAsArrayBuffer(file);
}
