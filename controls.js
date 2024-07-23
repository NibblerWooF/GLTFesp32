function toggleEditBones() {
    isEditingBones = !isEditingBones;

    if (isEditingBones) {
        document.getElementById('timeline-container').classList.remove('hidden');
        document.getElementById('transition-time').classList.remove('hidden');
        document.getElementById('axis-controls').style.display = 'block';
        document.getElementById('bone-controls').style.display = 'block';

        if (model) {
            if (transformControls) {
                transformControls.detach();
            }
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
        if (transformControls) {
            transformControls.detach();
        }
        document.getElementById('edit-bones-button').innerText = '编辑骨骼';
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
        if (boneName) {
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
}

function getLocalRotationAngle(bone, axis) {
    const localEuler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
    let angle = THREE.MathUtils.radToDeg(localEuler[axis]);
    return Math.round(angle); // 四舍五入到最接近的整数
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
