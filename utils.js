function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

function hasRotationChanged(bone, lastAngles) {
    const angleX = getLocalRotationAngle(bone, 'x').toFixed(1);
    const angleY = getLocalRotationAngle(bone, 'y').toFixed(1);
    const angleZ = getLocalRotationAngle(bone, 'z').toFixed(1);

    const changed = !lastAngles[bone.id] ||
        lastAngles[bone.id].x !== angleX || lastAngles[bone.id].y !== angleY || lastAngles[bone.id].z !== angleZ;

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
            console.log(`Bone name: ${boneName}, X: ${angleX}, Y: ${angleY}, Z: ${angleZ}`);

            if (transformControls.axis === 'X') {
                sendAngleToESP32(boneName, 'x', angleX);
            } else if (transformControls.axis === 'Y') {
                sendAngleToESP32(boneName, 'y', angleY);
            } else if (transformControls.axis === 'Z') {
                sendAngleToESP32(boneName, 'z', angleZ);
            }
        } else {
            console.warn(`Bone name not found for ID: ${bone.id}`);
        }
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
        } else {
            console.warn(`Label not found for bone ${marker.bone.name}`);
        }
    });
}

function getLocalRotationAngle(bone, axis) {
    const localEuler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
    let angle = THREE.MathUtils.radToDeg(localEuler[axis]);
    return Math.round(angle);
}
