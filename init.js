let websocket;
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
let totalFrames = 1;
let mixer, clock = new THREE.Clock();
let actions = {};
const lastAngles = {};
let lastSendTime = 0;
let previousAngle = null;
let boneMap = new Map(); // 在此定义 boneMap
let hdrTexture = null;

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    init();
    animate();
    bindEventListeners();
    document.getElementById('loadBackground').addEventListener('click', () => document.getElementById('backgroundInput').click());
    document.getElementById('backgroundInput').addEventListener('change', loadBackground);
    document.getElementById('toggleBackground').addEventListener('click', toggleBackground); // 新增按钮事件
});


function loadBackground(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const contents = e.target.result;
            const loader = new THREE.RGBELoader();
            loader.load(contents, function(texture) {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                scene.background = texture;
                scene.environment = texture;
                hdrTexture = texture; // 保存HDR纹理
                render();
            });
        };
        reader.readAsDataURL(file);
    }
}

function toggleBackground() {
    if (scene.background) {
        scene.background = null; // 隐藏背景
        renderer.setClearColor(0xD3D3D3); // 设置背景颜色为灰白色
    } else {
        scene.background = hdrTexture; // 显示背景
        renderer.setClearColor(0x000000); // 重置背景颜色
    }
    render();
}


function bindEventListeners() {
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

    // 绑定按钮和输入框的事件监听器
    const elements = [
        'file-input', 'edit-bones-button', 'reset-button', 'play-button', 'transition-time',
        'add-frame-button', 'remove-frame-button', 'save-button', 'load-animation-button',
        'load-animation-input', 'connect-button'
    ];

    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            switch (id) {
                case 'file-input':
                    element.addEventListener('change', handleFileSelect, false);
                    break;
                case 'edit-bones-button':
                    element.addEventListener('click', toggleEditBones, false);
                    break;
                case 'reset-button':
                    element.addEventListener('click', resetBones, false);
                    break;
                case 'play-button':
                    element.addEventListener('click', togglePlay, false);
                    break;
                case 'transition-time':
                    element.addEventListener('change', updateTransitionTime, false);
                    break;
                case 'add-frame-button':
                    element.addEventListener('click', addFrame, false);
                    break;
                case 'remove-frame-button':
                    element.addEventListener('click', removeFrame, false);
                    break;
                case 'save-button':
                    element.addEventListener('click', saveAnimation, false);
                    break;
                case 'load-animation-button':
                    element.addEventListener('click', () => {
                        const loadAnimationInput = document.getElementById('load-animation-input');
                        if (loadAnimationInput) loadAnimationInput.click();
                    }, false);
                    break;
                case 'load-animation-input':
                    element.addEventListener('change', loadAnimation, false);
                    break;
                case 'connect-button':
                    element.addEventListener('click', connectWebSocket);
                    break;
            }
        }
    });

    window.addEventListener('click', onMouseClick, false);
    window.addEventListener('resize', onWindowResize, false);
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
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xD3D3D3); // 设置初始清除颜色
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2; // 曝光度
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);

    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // 调整环境光强度
    scene.add(ambientLight);

    // 添加半球光
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0); // 调整半球光强度
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // 添加方向光
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5); // 调整方向光强度
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    scene.add(dirLight);

    // 添加地面参考线
    const ground = new THREE.GridHelper(10, 40, 0x000000, 0x000000);
    ground.material.opacity = 0.2;
    ground.material.transparent = true;
    scene.add(ground);

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
                updateAngleInfo(bone);
                updateBoneLabels();
            }
            recordKeyframe();
        });

        console.log("TransformControls initialized");
    } catch (error) {
        console.error("Error initializing TransformControls:", error);
    }

    createTimeline();
    console.log("Initialization complete");
}



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
                console.log(`Mapping bone ${child.name} with ID ${child.id}`); // 调试信息
                boneMap.set(child.id, child.name); // 使用骨骼名称而不是ID
                initialBoneRotations.set(child, child.rotation.clone());
            }
        });

        render();
    }, function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    }, function (error) {
        console.error('Error loading model:', error);
    });
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
