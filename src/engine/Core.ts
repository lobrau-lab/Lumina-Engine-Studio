import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as CANNON from 'cannon-es';
import { GameObjectData, SceneData } from './types';

export class EngineCore {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private objects: Map<string, THREE.Object3D> = new Map();
  private container: HTMLElement;
  private animationId: number | null = null;
  private onUpdate: (time: number, deltaTime: number) => void;
  private onObjectModified: (id: string, updates: Partial<GameObjectData>) => void;
  private onObjectSelected: (id: string | null) => void;
  
  private orbitControls: OrbitControls;
  private transformControls: TransformControls;
  private timer: THREE.Timer;

  private world: CANNON.World;
  private physicsBodies: Map<string, CANNON.Body> = new Map();
  private isPlaying: boolean = false;
  private currentSceneData: SceneData | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  
  private selectionBox: THREE.BoxHelper;
  private gridHelper: THREE.GridHelper;

  private modelCache: Map<string, THREE.Object3D> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();

  constructor(
    container: HTMLElement, 
    onUpdate: (time: number, deltaTime: number) => void,
    onObjectModified: (id: string, updates: Partial<GameObjectData>) => void,
    onObjectSelected: (id: string | null) => void
  ) {
    this.container = container;
    this.onUpdate = onUpdate;
    this.onObjectModified = onObjectModified;
    this.onObjectSelected = onObjectSelected;
    this.scene = new THREE.Scene();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Helpers
    this.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.gridHelper.position.y = -0.01; // Slightly below 0 to avoid z-fighting with planes
    this.scene.add(this.gridHelper);

    this.selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0xffaa00);
    (this.selectionBox.material as THREE.Material).depthTest = false;
    (this.selectionBox.material as THREE.Material).transparent = true;
    (this.selectionBox.material as THREE.Material).opacity = 0.8;
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    // Controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.size = 1.5; // Larger, more robust size
    this.transformControls.space = 'local'; // Local space for intuitive rotation/scaling
    this.scene.add(this.transformControls.getHelper());
    
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value;
    });

    this.transformControls.addEventListener('objectChange', () => {
      const obj = this.transformControls.object;
      if (obj && obj.userData.id) {
        // Sync rotation to Euler for the editor
        const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'XYZ');
        this.onObjectModified(obj.userData.id, {
          position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
          rotation: { x: euler.x, y: euler.y, z: euler.z },
          scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
        });
      }
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 40;
    this.scene.add(directionalLight);

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (this.isPlaying) return; // Don't select during play mode
    
    // Check if we are clicking on the transform controls
    if (this.transformControls.dragging) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Only intersect with our managed objects, not helpers or controls
    const interactableObjects = Array.from(this.objects.values());
    const intersects = this.raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
      // Find the root object that has userData.id
      let object: THREE.Object3D | null = intersects[0].object;
      while (object && !object.userData.id) {
        object = object.parent;
      }
      
      if (object && object.userData.id) {
        this.onObjectSelected(object.userData.id);
      }
    } else {
      this.onObjectSelected(null);
    }
  };

  private handleResize = () => {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  public setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    this.transformControls.setMode(mode);
  }

  public selectObject(id: string | null) {
    if (!id || this.isPlaying) {
      this.transformControls.detach();
      this.selectionBox.visible = false;
      return;
    }
    const obj = this.objects.get(id);
    if (obj) {
      this.transformControls.attach(obj);
      this.selectionBox.setFromObject(obj);
      this.selectionBox.visible = true;
    } else {
      this.transformControls.detach();
      this.selectionBox.visible = false;
    }
  }

  public setPlaying(playing: boolean) {
    this.isPlaying = playing;
    if (playing) {
      this.transformControls.detach();
      this.initPhysics();
    } else {
      this.clearPhysics();
      if (this.currentSceneData) {
        this.updateScene(this.currentSceneData);
      }
    }
  }

  private initPhysics() {
    this.clearPhysics();
    if (!this.currentSceneData) return;

    this.currentSceneData.objects.forEach(objData => {
      if (!objData.physics?.enabled) return;
      
      const mesh = this.objects.get(objData.id);
      if (!mesh) return;

      let shape: CANNON.Shape;
      switch (objData.type) {
        case 'cube':
          shape = new CANNON.Box(new CANNON.Vec3(objData.scale.x / 2, objData.scale.y / 2, objData.scale.z / 2));
          break;
        case 'sphere':
          // Using max scale for sphere radius to handle non-uniform scaling gracefully
          const radius = Math.max(objData.scale.x, objData.scale.y, objData.scale.z) / 2;
          shape = new CANNON.Sphere(radius);
          break;
        case 'plane':
          shape = new CANNON.Plane();
          break;
        default:
          return;
      }

      const body = new CANNON.Body({
        mass: objData.physics.type === 'static' ? 0 : (objData.physics.mass || 1),
        type: objData.physics.type === 'static' ? CANNON.Body.STATIC : (objData.physics.type === 'kinematic' ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC),
        shape: shape,
        position: new CANNON.Vec3(objData.position.x, objData.position.y, objData.position.z),
        fixedRotation: objData.physics.fixedRotation || false
      });

      if (objData.type === 'plane') {
        body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      } else {
        body.quaternion.setFromEuler(objData.rotation.x, objData.rotation.y, objData.rotation.z);
      }

      this.world.addBody(body);
      this.physicsBodies.set(objData.id, body);
    });
  }

  private clearPhysics() {
    this.physicsBodies.forEach(body => this.world.removeBody(body));
    this.physicsBodies.clear();
  }

  private loadModel(url: string, type: string | undefined, group: THREE.Group) {
    const onLoad = (object: any) => {
      const model = object.scene || object;
      // Enable shadows for the loaded model
      model.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.modelCache.set(url, model);
      group.add(model.clone());
    };
    
    try {
      if (type === 'gltf') new GLTFLoader().load(url, onLoad);
      else if (type === 'fbx') new FBXLoader().load(url, onLoad);
      else if (type === 'obj') new OBJLoader().load(url, onLoad);
    } catch (e) {
      console.error("Error loading model:", e);
    }
  }

  private createParticles(objData: GameObjectData): THREE.Points {
    const pData = objData.particles || { count: 1000, size: 0.1, speed: 1, spread: 1, type: 'fire' };
    const geometry = new THREE.BufferGeometry();
    const count = pData.count;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * pData.spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * pData.spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * pData.spread;
      
      velocities[i * 3] = (Math.random() - 0.5) * pData.speed;
      velocities[i * 3 + 1] = (Math.random() * pData.speed); // Mostly up
      velocities[i * 3 + 2] = (Math.random() - 0.5) * pData.speed;
      
      lifetimes[i] = Math.random();
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    
    const material = new THREE.PointsMaterial({
      size: pData.size,
      color: objData.color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const points = new THREE.Points(geometry, material);
    points.userData.isParticles = true;
    points.userData.particleConfig = { ...pData };
    return points;
  }

  public updateScene(data: SceneData) {
    this.currentSceneData = data;
    this.scene.background = new THREE.Color(data.backgroundColor);
    
    // Update shadow quality
    const shadowQuality = data.shadowQuality || 'off';
    this.renderer.shadowMap.enabled = shadowQuality !== 'off';
    
    let shadowMapSize = 1024;
    if (shadowQuality === 'low') shadowMapSize = 1024;
    else if (shadowQuality === 'medium') shadowMapSize = 2048;
    else if (shadowQuality === 'high') shadowMapSize = 4096;

    this.scene.children.forEach(child => {
      if (child instanceof THREE.DirectionalLight) {
        child.castShadow = shadowQuality !== 'off';
        if (shadowQuality !== 'off') {
          child.shadow.mapSize.width = shadowMapSize;
          child.shadow.mapSize.height = shadowMapSize;
          // Need to update the shadow map when size changes
          if (child.shadow.map) {
            child.shadow.map.dispose();
            child.shadow.map = null as any;
          }
        }
      }
    });
    
    // Simple diffing: remove objects that are no longer in data
    const dataIds = new Set(data.objects.map(o => o.id));
    this.objects.forEach((obj, id) => {
      if (!dataIds.has(id)) {
        if (this.transformControls.object === obj) this.transformControls.detach();
        this.scene.remove(obj);
        this.objects.delete(id);
      }
    });

    data.objects.forEach(objData => {
      let mesh = this.objects.get(objData.id);
      
      if (!mesh) {
        switch (objData.type) {
          case 'cube':
            mesh = new THREE.Mesh(
              new THREE.BoxGeometry(1, 1, 1),
              new THREE.MeshStandardMaterial({ color: objData.color })
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            break;
          case 'sphere':
            mesh = new THREE.Mesh(
              new THREE.SphereGeometry(0.5, 32, 32),
              new THREE.MeshStandardMaterial({ color: objData.color })
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            break;
          case 'plane':
            mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(10, 10),
              new THREE.MeshStandardMaterial({ color: objData.color, side: THREE.DoubleSide })
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.receiveShadow = true;
            break;
          case 'light':
            const light = new THREE.PointLight(objData.color, objData.intensity || 1);
            light.castShadow = true;
            const helper = new THREE.Mesh(
              new THREE.SphereGeometry(0.1, 8, 8),
              new THREE.MeshBasicMaterial({ color: objData.color })
            );
            mesh = new THREE.Group();
            mesh.add(light);
            mesh.add(helper);
            break;
          case 'sprite':
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = objData.color;
              ctx.beginPath();
              ctx.arc(32, 32, 30, 0, Math.PI * 2);
              ctx.fill();
            }
            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture });
            mesh = new THREE.Sprite(material);
            break;
          case 'particles':
            mesh = this.createParticles(objData);
            break;
          case 'model':
            mesh = new THREE.Group();
            if (objData.modelUrl) {
              if (this.modelCache.has(objData.modelUrl)) {
                mesh.add(this.modelCache.get(objData.modelUrl)!.clone());
              } else {
                this.loadModel(objData.modelUrl, objData.modelType, mesh as THREE.Group);
              }
            }
            break;
          default:
            mesh = new THREE.Group();
        }
        mesh.userData.id = objData.id;
        this.scene.add(mesh);
        this.objects.set(objData.id, mesh);
      } else if (objData.type === 'particles' && mesh instanceof THREE.Points) {
        // Check if count changed, if so recreate
        const pData = objData.particles;
        if (pData && mesh.userData.particleConfig.count !== pData.count) {
          this.scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          mesh = this.createParticles(objData);
          mesh.userData.id = objData.id;
          this.scene.add(mesh);
          this.objects.set(objData.id, mesh);
        }
      }

      // Update properties if not being dragged and not simulating physics for this object
      if (this.transformControls.object !== mesh && (!this.isPlaying || !this.physicsBodies.has(objData.id))) {
        mesh.position.set(objData.position.x, objData.position.y, objData.position.z);
        if (objData.type !== 'plane') {
          mesh.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z);
        }
        mesh.scale.set(objData.scale.x, objData.scale.y, objData.scale.z);
        
        if (mesh instanceof THREE.Mesh && ['cube', 'sphere', 'plane'].includes(objData.type)) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.set(objData.color);
          
          if (objData.textureUrl) {
            const currentSrc = mat.map?.image ? (mat.map.image as HTMLImageElement).src : undefined;
            if (currentSrc !== objData.textureUrl) {
              if (this.textureCache.has(objData.textureUrl)) {
                mat.map = this.textureCache.get(objData.textureUrl)!;
                mat.needsUpdate = true;
              } else {
                new THREE.TextureLoader().load(objData.textureUrl, (tex) => {
                  this.textureCache.set(objData.textureUrl!, tex);
                  mat.map = tex;
                  mat.needsUpdate = true;
                });
              }
            }
          } else {
            if (mat.map) {
              mat.map = null;
              mat.needsUpdate = true;
            }
          }
        } else if (mesh instanceof THREE.Points && mesh.userData.isParticles) {
          const pMat = mesh.material as THREE.PointsMaterial;
          pMat.color.set(objData.color);
          if (objData.particles) {
            pMat.size = objData.particles.size;
            mesh.userData.particleConfig = { ...objData.particles };
          }
        } else if (mesh instanceof THREE.Group) {
          const light = mesh.children.find(c => c instanceof THREE.PointLight) as THREE.PointLight;
          const helper = mesh.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh;
          if (light) {
            light.color.set(objData.color);
            light.intensity = objData.intensity || 1;
            light.castShadow = shadowQuality !== 'off';
            if (shadowQuality !== 'off') {
              if (light.shadow.mapSize.width !== shadowMapSize) {
                light.shadow.mapSize.width = shadowMapSize;
                light.shadow.mapSize.height = shadowMapSize;
                if (light.shadow.map) {
                  light.shadow.map.dispose();
                  light.shadow.map = null as any;
                }
              }
            }
          }
          if (helper) (helper.material as THREE.MeshBasicMaterial).color.set(objData.color);
        }
      }
      mesh.visible = objData.visible;
    });
  }

  public start() {
    if (this.animationId) return;
    this.timer.reset();
    const animate = (time: number) => {
      this.animationId = requestAnimationFrame(animate);
      this.timer.update(time);
      const deltaTime = this.timer.getDelta();
      
      if (this.isPlaying) {
        this.world.step(1 / 60, deltaTime, 3);
        
        this.physicsBodies.forEach((body, id) => {
          const mesh = this.objects.get(id);
          if (mesh) {
            mesh.position.copy(body.position as any);
            if (this.currentSceneData?.objects.find(o => o.id === id)?.type !== 'plane') {
              mesh.quaternion.copy(body.quaternion as any);
            }
          }
        });
      }

      // Update particles
      this.objects.forEach((mesh, id) => {
        if (mesh instanceof THREE.Points && mesh.userData.isParticles) {
          const config = mesh.userData.particleConfig;
          if (!config) return;
          
          const positions = mesh.geometry.attributes.position.array as Float32Array;
          const velocities = mesh.geometry.attributes.velocity.array as Float32Array;
          const lifetimes = mesh.geometry.attributes.lifetime.array as Float32Array;
          
          for (let i = 0; i < config.count; i++) {
            lifetimes[i] += deltaTime;
            
            if (lifetimes[i] > 1.0) {
              // Reset particle
              lifetimes[i] = 0;
              positions[i * 3] = (Math.random() - 0.5) * config.spread;
              positions[i * 3 + 1] = (Math.random() - 0.5) * config.spread;
              positions[i * 3 + 2] = (Math.random() - 0.5) * config.spread;
              
              if (config.type === 'fire' || config.type === 'smoke') {
                velocities[i * 3] = (Math.random() - 0.5) * config.speed * 0.5;
                velocities[i * 3 + 1] = (Math.random() * config.speed) + config.speed * 0.5; // Always up
                velocities[i * 3 + 2] = (Math.random() - 0.5) * config.speed * 0.5;
              } else if (config.type === 'sparks') {
                velocities[i * 3] = (Math.random() - 0.5) * config.speed * 2;
                velocities[i * 3 + 1] = (Math.random() * config.speed * 2);
                velocities[i * 3 + 2] = (Math.random() - 0.5) * config.speed * 2;
              }
            }
            
            // Move particle
            positions[i * 3] += velocities[i * 3] * deltaTime;
            positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime;
            positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime;
            
            // Apply forces based on type
            if (config.type === 'smoke') {
              velocities[i * 3] += (Math.random() - 0.5) * deltaTime; // Wind drift
              velocities[i * 3 + 2] += (Math.random() - 0.5) * deltaTime;
            } else if (config.type === 'sparks') {
              velocities[i * 3 + 1] -= 9.8 * deltaTime; // Gravity
            }
          }
          
          mesh.geometry.attributes.position.needsUpdate = true;
        }
      });

      if (this.selectionBox.visible && this.transformControls.object) {
        this.selectionBox.update();
      }

      this.onUpdate(time, deltaTime);
      this.orbitControls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  public stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public dispose() {
    this.stop();
    this.timer.dispose();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.orbitControls.dispose();
    this.transformControls.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  public getObject(id: string) {
    return this.objects.get(id);
  }

  public exportScene() {
    const exporter = new GLTFExporter();
    const exportScene = new THREE.Scene();
    
    this.objects.forEach((obj, id) => {
      const objData = this.currentSceneData?.objects.find(o => o.id === id);
      if (objData && objData.type !== 'particles' && objData.type !== 'sprite') {
         const clone = obj.clone();
         exportScene.add(clone);
      }
    });

    exporter.parse(
      exportScene,
      (gltf) => {
        const output = JSON.stringify(gltf, null, 2);
        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = 'scene.gltf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      (error) => { console.error('An error happened during export:', error); },
      { binary: false }
    );
  }
}

