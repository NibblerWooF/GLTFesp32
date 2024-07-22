document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    init();
    animate();

    // 绑定骨骼轴控制复选框的事件监听器
    document.querySelectorAll('.axis-x').forEach(checkbox => {
        checkbox.addEventListener('change', updateBoneAxisControls);
    });
    document.querySelectorAll('.axis-y').forEach(checkbox => {
        checkbox.addEventListener('change', updateBoneAxisControls);
    });
    document.querySelectorAll('.axis-z').forEach(checkbox => {
        checkbox.addEventListener('change', updateBoneAxisControls);
    });

    // 绑定全局轴控制复选框的事件监听器
    document.getElementById('axis-x').addEventListener('change', updateTransformControlsAxis);
    document.getElementById('axis-y').addEventListener('change', updateTransformControlsAxis);
    document.getElementById('axis-z').addEventListener('change', updateTransformControlsAxis);
});

let scene, camera, renderer, controls, transformControls, model, skeletonHelper;
let isEditingBones = false;
const boneMarkers = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedBoneMarker = null;
const initialBoneRotations = new Map();
const keyframes = {};
const boneAxisControls = new Map(); // 为每个骨骼保存它们的轴控制状态
let currentFrame = 0;
let isPlaying = false;
let playInterval;
let transitionTime = 1; // 秒
let totalFrames = 1;
let mixer, clock = new THREE.Clock();
let actions = {};
let websocket;

const lastAngles = {};

// 线性插值函数
function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

const SEND_INTERVAL = 50; // 发送间隔时间（毫秒）
let lastSendTime = 0;
let previousAngle = null;
const MAX_ANGLE_CHANGE = 3; // 每次允许的最大角度变化值

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

// 删除或注释掉原来的interpolateAngles函数
// function interpolateAngles(startAngle, endAngle, steps) {
//     let angleSteps = [];
//     let stepSize = (endAngle - startAngle) / steps;
//     for (let i = 1; i <= steps; i++) {
//         angleSteps.push(startAngle + stepSize * i);
//     }
//     return angleSteps;
// }

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

function hasRotationChanged(bone, lastAngles) {
    const angleX = getLocalRotationAngle(bone, 'x').toFixed(1);
    const angleY = getLocalRotationAngle(bone, 'y').toFixed(1);
    const angleZ = getLocalRotationAngle(bone, 'z').toFixed(1);

    const changed = lastAngles[bone.id] &&
        (lastAngles[bone.id].x !== angleX || lastAngles[bone.id].y !== angleY || lastAngles[bone.id].z !== angleZ);

    lastAngles[bone.id] = { x: angleX, y: angleY, z: angleZ };
    return changed;
}

function updateAngleInfo(bone) {
    if (hasRotationChanged(bone, lastAngles)) {
        const angleX = getLocalRotationAngle(bone, 'x').toFixed(1);
        const angleY = getLocalRotationAngle(bone, 'y').toFixed(1);
        const angleZ = getLocalRotationAngle(bone, 'z').toFixed(1);

        console.log(`Updating angles for bone ${bone.id} - X: ${angleX}, Y: ${angleY}, Z: ${angleZ}`);

        const boneName = boneMap.get(bone.id);
        if (boneName) {
            console.log(`Sending angles to ESP32 for bone ${boneName}`);
            sendAngleToESP32(boneName, 'x', angleX);
            sendAngleToESP32(boneName, 'y', angleY);
            sendAngleToESP32(boneName, 'z', angleZ);
        } else {
            console.warn(`Bone name not found for ID: ${bone.id}`);
        }
    }
}

function updateAngleInfo(bone) {
    const angleX = getLocalRotationAngle(bone, 'x').toFixed(1);
    const angleY = getLocalRotationAngle(bone, 'y').toFixed(1);
    const angleZ = getLocalRotationAngle(bone, 'z').toFixed(1);

    let axisChanged = false;

    if (lastAngles[bone.id]) {
        if (lastAngles[bone.id].x !== angleX) {
            axisChanged = true;
            sendAngleToESP32(boneMap.get(bone.id), 'x', angleX);
        }
        if (lastAngles[bone.id].y !== angleY) {
            axisChanged = true;
            sendAngleToESP32(boneMap.get(bone.id), 'y', angleY);
        }
        if (lastAngles[bone.id].z !== angleZ) {
            axisChanged = true;
            sendAngleToESP32(boneMap.get(bone.id), 'z', angleZ);
        }
    } else {
        lastAngles[bone.id] = { x: angleX, y: angleY, z: angleZ };
    }

    if (axisChanged) {
        lastAngles[bone.id] = { x: angleX, y: angleY, z: angleZ };
    }
}

function updateBoneLabels() {
    boneMarkers.forEach(marker => {
        const vector = new THREE.Vector3();
        marker.getWorldPosition(vector);
        vector.project(camera);
        const x = Math.round((vector.x + 1) * window.innerWidth / 2);
        const y = Math.round((-vector.y + 1) * window.innerHeight / 2);
        const label = document.getElementById(`label-${marker.bone.id}`);
        if (label) {
            const angleX = Math.abs(getLocalRotationAngle(marker.bone, 'x'));
            const angleY = Math.abs(getLocalRotationAngle(marker.bone, 'y'));
            const angleZ = Math.abs(getLocalRotationAngle(marker.bone, 'z'));

            let angleText = `X: ${angleX}° Y: ${angleY}° Z: ${angleZ}°`;
            let color = 'black';

            if (transformControls.axis === 'X') {
                angleText = `X: ${angleX}°`;
                color = 'red';
            } else if (transformControls.axis === 'Y') {
                angleText = `Y: ${angleY}°`;
                color = 'green';
            } else if (transformControls.axis === 'Z') {
                angleText = `Z: ${angleZ}°`;
                color = 'blue';
            }

            label.style.left = `${x}px`;
            label.style.top = `${y}px`;
            label.style.color = color;
            label.textContent = `${marker.bone.name}: ${angleText}`;
            console.log(`Label updated for bone ${marker.bone.name}: ${angleText} at position (${x}, ${y})`);
        } else {
            console.warn(`Label not found for bone ${marker.bone.name}`);
        }
    });
}

function onMouseClick(event) {
    if (!isEditingBones) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(boneMarkers);

    if (intersects.length > 0) {
        if (selectedBoneMarker) {
            selectedBoneMarker.material.color.set(0xffff00); // 恢复之前选中骨骼的颜色
            const previousLabel = document.getElementById(`label-${selectedBoneMarker.bone.id}`);
            if (previousLabel) {
                previousLabel.style.color = 'black'; // 恢复之前选中骨骼的标签颜色
            }
        }
        const selectedBone = intersects[0].object;
        selectedBone.material.color.set(0x00ff00); // 选中骨骼的颜色变为绿色
        selectedBoneMarker = selectedBone;

        // 恢复选中的骨骼的轴控制状态
        const boneId = selectedBone.bone.id;
        const axisControl = boneAxisControls.get(boneId) || { showX: true, showY: true, showZ: true };

        document.querySelector(`.axis-x[data-bone="${boneId}"]`).checked = axisControl.showX;
        document.querySelector(`.axis-y[data-bone="${boneId}"]`).checked = axisControl.showY;
        document.querySelector(`.axis-z[data-bone="${boneId}"]`).checked = axisControl.showZ;

        transformControls.showX = axisControl.showX;
        transformControls.showY = axisControl.showY;
        transformControls.showZ = axisControl.showZ;
        transformControls.attach(selectedBoneMarker.bone);

        const currentLabel = document.getElementById(`label-${selectedBone.bone.id}`);
        if (currentLabel) {
            currentLabel.style.color = 'blue'; // 选中骨骼的标签颜色变为蓝色
        }
        updateAngleInfo(selectedBone.bone);

        const boneName = boneMap.get(selectedBone.bone.id);
        console.log(`Bone ID: ${selectedBone.bone.id}, Bone Name: ${boneName}`);

        if (boneName) {
            // 仅在角度变化时发送消息
            const angleX = getLocalRotationAngle(selectedBone.bone, 'x').toFixed(1);
            const angleY = getLocalRotationAngle(selectedBone.bone, 'y').toFixed(1);
            const angleZ = getLocalRotationAngle(selectedBone.bone, 'z').toFixed(1);

            if (!lastAngles[selectedBone.bone.id] || lastAngles[selectedBone.bone.id].x !== angleX) {
                sendAngleToESP32(boneName, 'x', angleX);
            }
            if (!lastAngles[selectedBone.bone.id] || lastAngles[selectedBone.bone.id].y !== angleY) {
                sendAngleToESP32(boneName, 'y', angleY);
            }
            if (!lastAngles[selectedBone.bone.id] || lastAngles[selectedBone.bone.id].z !== angleZ) {
                sendAngleToESP32(boneName, 'z', angleZ);
            }

            lastAngles[selectedBone.bone.id] = { x: angleX, y: angleY, z: angleZ };
        } else {
            console.warn(`Bone name not found for ID: ${selectedBone.bone.id}`);
        }
    }
}

function updateTransformControlsAxis() {
    const globalShowX = document.getElementById('axis-x').checked;
    const globalShowY = document.getElementById('axis-y').checked;
    const globalShowZ = document.getElementById('axis-z').checked;

    boneMarkers.forEach(marker => {
        const boneId = marker.bone.id;
        const axisControl = boneAxisControls.get(boneId) || { showX: true, showY: true, showZ: true };

        axisControl.showX = globalShowX;
        axisControl.showY = globalShowY;
        axisControl.showZ = globalShowZ;

        boneAxisControls.set(boneId, axisControl);
    });

    if (selectedBoneMarker) {
        const boneId = selectedBoneMarker.bone.id;
        const axisControl = boneAxisControls.get(boneId);

        transformControls.showX = axisControl.showX;
        transformControls.showY = axisControl.showY;
        transformControls.showZ = axisControl.showZ;
        transformControls.attach(selectedBoneMarker.bone);
    } else {
        transformControls.showX = globalShowX;
        transformControls.showY = globalShowY;
        transformControls.showZ = globalShowZ;
    }

    render();
    updateBoneLabels();
}

function getLocalRotationAngle(bone, axis) {
    const localEuler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
    let angle = THREE.MathUtils.radToDeg(localEuler[axis]);
    return Math.round(angle); // Rounding to the nearest integer
}

function resetBones() {
    initialBoneRotations.forEach((rotation, bone) => {
        bone.rotation.copy(rotation);
    });

    model.traverse(function (child) {
        if (child.isBone) {
            if (!keyframes[child.name]) keyframes[child.name] = {};
            keyframes[child.name][currentFrame] = child.rotation.clone();
        }
    });
    render();
}

function init() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd3d7d4);

    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.001, 10000);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);

    try {
        transformControls = new THREE.TransformControls(camera, renderer.domElement);
        scene.add(transformControls);

        transformControls.setSpace('local');
        transformControls.setMode('rotate');

        transformControls.addEventListener('dragging-changed', function(event) {
            controls.enabled = !event.value;
            if (!event.value && selectedBoneMarker) {
                updateBoneLabels();
                updateAngleInfo(selectedBoneMarker.bone);
            }
        });

        transformControls.addEventListener('change', function() {
            if (selectedBoneMarker && transformControls.dragging) {
                const bone = selectedBoneMarker.bone;

                const rotationBefore = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
                console.log(`Before rotation - Bone: ${bone.name}, Rotation: ${rotationBefore.x}, ${rotationBefore.y}, ${rotationBefore.z}`);

                let newRotation = new THREE.Euler(rotationBefore.x, rotationBefore.y, rotationBefore.z, 'XYZ');

                bone.quaternion.setFromEuler(newRotation);

                const rotationAfter = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
                console.log(`After rotation - Bone: ${bone.name}, Rotation: ${rotationAfter.x}, ${rotationAfter.y}, ${rotationAfter.z}`);

                updateAngleInfo(bone);
                updateBoneLabels();
            }
            recordKeyframe();
        });

        console.log("TransformControls initialized");
    } catch (error) {
        console.error("Error initializing TransformControls:", error);
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight1.position.set(5, 10, 7.5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight2.position.set(-5, -10, -7.5);
    scene.add(directionalLight2);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 1.5);
    backLight.position.set(0, 10, -10).normalize();
    scene.add(backLight);

    const ground = new THREE.GridHelper(10, 40, 0x000000, 0x000000);
    ground.material.opacity = 0.2;
    ground.material.transparent = true;
    scene.add(ground);

    window.addEventListener('resize', onWindowResize, false);

    const elements = [
        'file-input', 'edit-bones-button', 'reset-button', 'play-button', 'transition-time',
        'add-frame-button', 'remove-frame-button', 'save-button', 'load-animation-button',
        'load-animation-input', 'connect-button', 'axis-x', 'axis-y', 'axis-z'
    ];

    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`Element with id ${id} found.`);
            try {
                switch (id) {
                    case 'file-input':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('change', handleFileSelect, false);
                        break;
                    case 'edit-bones-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', toggleEditBones, false);
                        break;
                    case 'reset-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', resetBones, false);
                        break;
                    case 'play-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', togglePlay, false);
                        break;
                    case 'transition-time':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('change', updateTransitionTime, false);
                        break;
                    case 'add-frame-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', addFrame, false);
                        break;
                    case 'remove-frame-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', removeFrame, false);
                        break;
                    case 'save-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', saveAnimation, false);
                        break;
                    case 'load-animation-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', () => {
                            const loadAnimationInput = document.getElementById('load-animation-input');
                            if (loadAnimationInput) loadAnimationInput.click();
                        }, false);
                        break;
                    case 'load-animation-input':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('change', loadAnimation, false);
                        break;
                    case 'connect-button':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('click', connectWebSocket);
                        break;
                    case 'axis-x':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('change', updateTransformControlsAxis);
                        break;
                    case 'axis-y':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('change', updateTransformControlsAxis);
                        break;
                    case 'axis-z':
                        console.log(`Adding event listener to ${id}`);
                        element.addEventListener('change', updateTransformControlsAxis);
                        break;
                    default:
                        console.warn(`Unhandled element id: ${id}`);
                }
            } catch (error) {
                console.error(`Error adding event listener to ${id}:`, error);
            }
        } else {
            console.error(`Element with id ${id} not found.`);
        }
    });

    window.addEventListener('click', onMouseClick, false);

    createTimeline();
    console.log("Initialization complete");
}

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

window.onload = connectWebSocket;

function log(message) {
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += `<p>${message}</p>`;
}

let boneMap = new Map();

function loadModel(data, isBinary) {
    const loader = new THREE.GLTFLoader();
    const blob = new Blob([data], { type: isBinary ? 'model/gltf-binary' : 'model/gltf+json' });
    const url = URL.createObjectURL(blob);

    loader.load(url, function (gltf) {
        console.log('Model loaded successfully');
        if (model) {
            scene.remove(model);
            transformControls.detach();
            if (skeletonHelper) {
                scene.remove(skeletonHelper);
            }
            boneMarkers.forEach(marker => scene.remove(marker));
            boneMarkers.length = 0;
        }
        model = gltf.scene;

        model.traverse(function (child) {
            if (child.isMesh) {
                child.material.emissive = new THREE.Color(0x222222);
                child.material.emissiveIntensity = 0.5;
            }
        });

        scene.add(model);

        if (gltf.animations && gltf.animations.length) {
            mixer = new THREE.AnimationMixer(gltf.scene);
            actions = {};
            const actionsSelect = document.getElementById('actions');
            actionsSelect.innerHTML = '';
            gltf.animations.forEach((clip, index) => {
                const action = mixer.clipAction(clip);
                actions[clip.name] = action;

                const option = document.createElement('option');
                option.value = clip.name;
                option.text = clip.name;
                actionsSelect.appendChild(option);

                if (index === 0) {
                    action.play();
                }
            });
            actionsSelect.style.display = 'block';
            document.getElementById('export-action').style.display = 'block';
            document.getElementById('import-action').style.display = 'block';
            document.getElementById('delete-action').style.display = 'block';
        }

        model.traverse(function (child) {
            if (child.isBone) {
                console.log('Bone ID:', child.id, 'Bone name:', child.name);
                boneMap.set(child.id, child.name); // 使用骨骼名称而不是ID
                initialBoneRotations.set(child, child.rotation.clone());
            }
        });

        // skeletonHelper = new THREE.SkeletonHelper(model);
        // skeletonHelper.material.linewidth = 2;
        // skeletonHelper.material.color.setHex(0xffffff);
        // scene.add(skeletonHelper);

        // addBoneMarkers(skeletonHelper);

        recordInitialKeyframe();
        render();
    }, function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    }, function (error) {
        console.error('Error loading model:', error);
    });
}

function toggleEditBones() {
    isEditingBones = !isEditingBones;

    if (isEditingBones) {
        document.getElementById('timeline-container').classList.remove('hidden');
        document.getElementById('transition-time').classList.remove('hidden');
        document.getElementById('axis-controls').style.display = 'block';
        document.getElementById('bone-controls').style.display = 'block';

        if (model) {
            transformControls.detach();
            model.traverse(function (child) {
                if (child.isMesh) {
                    child.material.transparent = true;
                    child.material.opacity = 0.5;
                }
            });

            skeletonHelper = new THREE.SkeletonHelper(model);
            skeletonHelper.material.linewidth = 2;
            skeletonHelper.material.color.setHex(0xffffff);
            scene.add(skeletonHelper);

            addBoneMarkers(skeletonHelper);
        }
        document.getElementById('edit-bones-button').innerText = '退出骨骼编辑';
    } else {
        document.getElementById('timeline-container').classList.add('hidden');
        document.getElementById('transition-time').classList.add('hidden');
        document.getElementById('axis-controls').style.display = 'none';
        document.getElementById('bone-controls').style.display = 'none';

        if (model) {
            model.traverse(function (child) {
                if (child.isMesh) {
                    child.material.transparent = false;
                    child.material.opacity = 1;
                }
            });

            if (skeletonHelper) {
                scene.remove(skeletonHelper);
                skeletonHelper = null;
            }
            boneMarkers.forEach(marker => scene.remove(marker));
            boneMarkers.length = 0;

            const labels = document.getElementsByClassName('bone-label');
            while (labels.length > 0) {
                labels[0].parentNode.removeChild(labels[0]);
            }
        }
        document.getElementById('edit-bones-button').innerText = '编辑骨骼';
        transformControls.detach();
    }
    render();
}

function addBoneMarkers(skeleton) {
    const boneList = document.getElementById('bone-list');
    boneList.innerHTML = '';

    skeleton.bones.forEach(bone => {
        const geometry = new THREE.SphereGeometry(0.05, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(bone.getWorldPosition(new THREE.Vector3()));
        marker.bone = bone;
        marker.name = bone.name;
        boneMarkers.push(marker);
        scene.add(marker);

        const div = document.createElement('div');
        div.className = 'bone-label';
        div.style.position = 'absolute';
        div.style.color = 'black';
        div.style.fontSize = '12px';
        div.style.pointerEvents = 'none';
        div.style.transform = 'translate(-50%, -50%)';
        div.innerHTML = bone.name;
        div.id = `label-${bone.id}`;
        document.body.appendChild(div);

        const boneItem = document.createElement('div');
        boneItem.className = 'bone-item';
        boneItem.innerHTML = `
            <div class="bone-name">${bone.name}</div>
            <div class="axis-controls">
                <label><input type="checkbox" class="axis-x" checked data-bone="${bone.id}"> X轴</label>
                <label><input type="checkbox" class="axis-y" checked data-bone="${bone.id}"> Y轴</label>
                <label><input type="checkbox" class="axis-z" checked data-bone="${bone.id}"> Z轴</label>
            </div>
        `;
        boneList.appendChild(boneItem);
    });

    document.querySelectorAll('.axis-x').forEach(checkbox => {
        checkbox.addEventListener('change', updateBoneAxisControls);
    });
    document.querySelectorAll('.axis-y').forEach(checkbox => {
        checkbox.addEventListener('change', updateBoneAxisControls);
    });
    document.querySelectorAll('.axis-z').forEach(checkbox => {
        checkbox.addEventListener('change', updateBoneAxisControls);
    });
}

function updateBoneAxisControls(event) {
    const boneId = event.target.dataset.bone;
    const showX = document.querySelector(`.axis-x[data-bone="${boneId}"]`).checked;
    const showY = document.querySelector(`.axis-y[data-bone="${boneId}"]`).checked;
    const showZ = document.querySelector(`.axis-z[data-bone="${boneId}"]`).checked;

    // 保存每个骨骼的轴控制状态
    boneAxisControls.set(boneId, { showX, showY, showZ });

    if (selectedBoneMarker && selectedBoneMarker.bone.id === boneId) {
        transformControls.showX = showX;
        transformControls.showY = showY;
        transformControls.showZ = showZ;
        transformControls.attach(selectedBoneMarker.bone);
    }

    render();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function render() {
    renderer.render(scene, camera);
    updateBoneLabels();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (mixer) mixer.update(clock.getDelta());
    boneMarkers.forEach(marker => {
        marker.position.copy(marker.bone.getWorldPosition(new THREE.Vector3()));
    });
    render();
}

function createTimeline() {
    const timelineFrameContainer = document.getElementById('timeline-frame-container');
    for (let i = 0; i < totalFrames; i++) {
        const frame = document.createElement('div');
        frame.className = 'timeline-frame';
        frame.innerText = i + 1;
        frame.dataset.frame = i;
        frame.addEventListener('click', () => selectFrame(i));
        timelineFrameContainer.appendChild(frame);
    }
}

function updateTimeline() {
    const timelineFrameContainer = document.getElementById('timeline-frame-container');
    timelineFrameContainer.innerHTML = '';
    createTimeline();
}

function addFrame() {
    totalFrames += 1;
    updateTimeline();
}

function removeFrame() {
    if (totalFrames > 1) {
        totalFrames -= 1;
        updateTimeline();
    }
}

function recordInitialKeyframe() {
    model.traverse(function (child) {
        if (child.isBone) {
            if (!keyframes[child.name]) keyframes[child.name] = {};
            keyframes[child.name][0] = child.rotation.clone();
        }
    });
    selectFrame(0);
}

function selectFrame(frame) {
    currentFrame = frame;
    document.querySelectorAll('.timeline-frame').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.timeline-frame[data-frame="${frame}"]`).classList.add('selected');
    applyKeyframe(frame);
}

function recordKeyframe() {
    if (!isEditingBones) return;

    console.log(`Recording keyframe for frame: ${currentFrame}`);

    model.traverse(function (child) {
        if (child.isBone) {
            if (!keyframes[child.name]) keyframes[child.name] = {};
            let rotation = child.rotation.clone();

            // 保留负角度
            keyframes[child.name][currentFrame] = rotation;
            console.log(`Bone: ${child.name}, Rotation: ${rotation.x}, ${rotation.y}, ${rotation.z}`);
        }
    });
}

function applyKeyframe(frame) {
    if (!model) return;

    model.traverse(function (child) {
        if (child.isBone && keyframes[child.name]) {
            if (keyframes[child.name][frame]) {
                child.rotation.copy(keyframes[child.name][frame]);
            } else if (keyframes[child.name][0]) {
                child.rotation.copy(keyframes[child.name][0]);
            }
        }
    });

    render();
}

function transitionKeyframe(fromFrame, toFrame, duration) {
    if (!model) return;

    const startTime = performance.now();
    const startQuaternions = {};

    model.traverse(function (child) {
        if (child.isBone && keyframes[child.name] && keyframes[child.name][toFrame]) {
            startQuaternions[child.name] = child.quaternion.clone();
        }
    });

    function animateTransition() {
        const elapsedTime = performance.now() - startTime;
        const t = Math.min(elapsedTime / (duration * 1000), 1);

        model.traverse(function (child) {
            if (child.isBone && startQuaternions[child.name]) {
                const startQuaternion = startQuaternions[child.name];
                const endRotation = keyframes[child.name][toFrame];

                if (startQuaternion && endRotation) {
                    const endQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(endRotation._x, endRotation._y, endRotation._z));
                    THREE.Quaternion.slerp(startQuaternion, endQuaternion, child.quaternion, t);
                }
            }
        });

        render();

        if (t < 1) {
            requestAnimationFrame(animateTransition);
        } else {
            currentFrame = toFrame;
            selectFrame(toFrame);
            if (isPlaying) {
                setTimeout(() => {
                    const nextFrame = (currentFrame + 1) % totalFrames;
                    transitionKeyframe(currentFrame, nextFrame, transitionTime);
                }, transitionTime * 1000);
            }
        }
    }

    requestAnimationFrame(animateTransition);
}

function togglePlay() {
    if (isPlaying) {
        isPlaying = false;
        document.getElementById('play-button').innerText = '播放';
    } else {
        isPlaying = true;
        document.getElementById('play-button').innerText = '暂停';
        const nextFrame = (currentFrame + 1) % totalFrames;
        transitionKeyframe(currentFrame, nextFrame, transitionTime);
    }
}

function updateTransitionTime(event) {
    transitionTime = parseFloat(event.target.value) || 1;
}

function saveAnimation() {
    const completeKeyframes = {};

    for (let frame = 0; frame < totalFrames; frame++) {
        model.traverse(function (child) {
            if (child.isBone) {
                if (!completeKeyframes[child.name]) completeKeyframes[child.name] = {};
                if (keyframes[child.name] && keyframes[child.name][frame]) {
                    completeKeyframes[child.name][frame] = keyframes[child.name][frame];
                } else if (keyframes[child.name] && keyframes[child.name][0]) {
                    completeKeyframes[child.name][frame] = keyframes[child.name][0];
                } else {
                    completeKeyframes[child.name][frame] = initialBoneRotations.get(child);
                }
            }
        });
    }

    const animationData = {
        keyframes: completeKeyframes,
        totalFrames: totalFrames
    };
    const blob = new Blob([JSON.stringify(animationData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animation.json';
    a.click();
    URL.revokeObjectURL(url);
}

function loadAnimation(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const contents = e.target.result;
        const animationData = JSON.parse(contents);
        const validBones = ["bn_Spine4", "bn_Spine15", "bn_Spine26", "bn_Neck7"];

        const filteredKeyframes = {};
        for (const bone in animationData.keyframes) {
            filteredKeyframes[bone] = animationData.keyframes[bone];
        }

        Object.assign(keyframes, filteredKeyframes);
        totalFrames = animationData.totalFrames;
        updateTimeline();
        applyKeyframe(currentFrame);

        if (model) {
            model.traverse(function (child) {
                if (child.isBone && !validBones.includes(child.name)) {
                    if (initialBoneRotations.has(child)) {
                        child.rotation.copy(initialBoneRotations.get(child));
                    }
                }
            });
        }

        if (isPlaying) {
            clearInterval(playInterval);
            playInterval = setInterval(() => {
                const nextFrame = (currentFrame + 1) % totalFrames;
                transitionKeyframe(currentFrame, nextFrame, transitionTime);
            }, transitionTime * 1000);
        }
    };
    reader.readAsText(file);
}
