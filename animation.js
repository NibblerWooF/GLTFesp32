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

    model.traverse(function (child) {
        if (child.isBone) {
            if (!keyframes[child.name]) keyframes[child.name] = {};
            keyframes[child.name][currentFrame] = child.rotation.clone();
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
