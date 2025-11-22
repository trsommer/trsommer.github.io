export const commonCode = `
    struct Uniforms {
        time: f32,
        resolution: vec2f,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
    };

    @vertex
    fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var pos = array<vec2f, 6>(
            vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
            vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
        );

        var output: VertexOutput;
        output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
        output.uv = pos[vertexIndex] * 0.5 + 0.5;
        return output;
    }

    // ---------------------------------------------------------
    // Noise Functions
    // ---------------------------------------------------------
    fn hash(p: vec3f) -> f32 {
        var p3 = fract(p * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    fn noise(p: vec3f) -> f32 {
        let i = floor(p);
        let f = fract(p);
        let u = f * f * (3.0 - 2.0 * f);
        
        return mix(mix(mix( hash(i + vec3f(0,0,0)), hash(i + vec3f(1,0,0)), u.x),
                       mix( hash(i + vec3f(0,1,0)), hash(i + vec3f(1,1,0)), u.x), u.y),
                   mix(mix( hash(i + vec3f(0,0,1)), hash(i + vec3f(1,0,1)), u.x),
                       mix( hash(i + vec3f(0,1,1)), hash(i + vec3f(1,1,1)), u.x), u.y), u.z);
    }

    fn fbm(p: vec3f) -> f32 {
        var value = 0.0;
        var amplitude = 0.5;
        var st = p;
        for (var i = 0; i < 5; i++) {
            value += amplitude * noise(st);
            st = st * 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    fn warp(p: vec3f) -> f32 {
        let q = vec3f(fbm(p), fbm(p + vec3f(5.2, 1.3, 2.8)), fbm(p + vec3f(1.8, 9.2, 5.5)));
        return fbm(p + 4.0 * q);
    }
`;

export const blackHoleFrag = `
    // ---------------------------------------------------------
    // 3D Raymarching & Physics (Black Hole)
    // ---------------------------------------------------------

    @fragment
    fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        let aspect = uniforms.resolution.x / uniforms.resolution.y;
        let p = (uv - 0.5) * 2.0 * vec2f(aspect, 1.0);

        // Camera Setup
        let time = uniforms.time * 0.05; 
        // Zoomed out slightly to show surroundings
        let camDist = 11.0; 
        let camH = camDist * 0.1; 
        let ro = vec3f(camDist * cos(time), camH, camDist * sin(time));
        let ta = vec3f(0.0, 0.0, 0.0);
        
        let w = normalize(ta - ro);
        let up = vec3f(0.0, 1.0, 0.0);
        let u = normalize(cross(w, up));
        let v = cross(u, w);
        
        var rd = normalize(p.x * u + p.y * v + 1.0 * w);
        var currPos = ro;

        // Black hole parameters
        // Large mass to keep it big on screen
        let bhMass = 1.2; 
        let eventHorizon = 2.0 * bhMass; 
        let accretionInner = eventHorizon * 1.2;
        let accretionOuter = eventHorizon * 4.5; 

        var col = vec3f(0.0);
        var glow = 0.0;
        
        let steps = 500;
        let stepSize = 0.1;
        
        for (var i = 0; i < steps; i++) {
            let r = length(currPos);
            
            // Event Horizon
            if (r < eventHorizon) {
                col = vec3f(0.0); 
                break;
            }

            // Gravitational Lensing
            let force = (bhMass * 3.0) / (r * r + 0.01); 
            rd = normalize(rd - normalize(currPos) * force * stepSize);

            // Photon Ring
            let distToHorizon = r - eventHorizon;
            if (distToHorizon < 0.2 && distToHorizon > 0.0) {
                    col += vec3f(0.7, 0.8, 1.0) * (0.01 / (distToHorizon + 0.01));
            }

            // Accretion Disk
            let distToPlane = abs(currPos.y);
            if (distToPlane < 0.6 && r > accretionInner && r < accretionOuter) {
                let angle = atan2(currPos.z, currPos.x);
                let rotAngle = angle + time * (4.0 / sqrt(r));
                
                let noiseVal = warp(vec3f(r * 1.5, rotAngle * 2.0, currPos.y * 2.0));
                
                let radialFade = smoothstep(accretionInner, accretionInner + 0.5, r) * 
                                    (1.0 - smoothstep(accretionOuter - 1.0, accretionOuter, r));
                let verticalFade = 1.0 - smoothstep(0.0, 0.3, distToPlane);
                
                let density = noiseVal * radialFade * verticalFade * 0.6;
                
                // Gold/White/Blue Palette
                let temp = (accretionOuter - r) / (accretionOuter - accretionInner);
                let colorOuter = vec3f(0.05, 0.2, 0.7);
                let colorInner = vec3f(1.0, 0.9, 0.6);
                let diskColor = mix(colorOuter, colorInner, pow(temp, 0.7)) + vec3f(temp * 0.6); 
                
                col += diskColor * density * stepSize * 4.0;
            }
            
            glow += 0.01 / (r*r + 0.1);

            currPos += rd * stepSize;
            
            if (r > 25.0) {
                    // Brighter stars
                    let starVal = pow(noise(rd * 300.0), 20.0); 
                    col += vec3f(starVal);
                break;
            }
        }
        
        col += vec3f(0.1, 0.3, 0.6) * glow * 0.08;
        col = 1.0 - exp(-col * 1.2);

        return vec4f(col, 1.0);
    }
`;

export const agnFrag = `
    // ---------------------------------------------------------
    // 3D Raymarching & Physics (AGN / Quasar)
    // ---------------------------------------------------------

    @fragment
    fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        let aspect = uniforms.resolution.x / uniforms.resolution.y;
        let p = (uv - 0.5) * 2.0 * vec2f(aspect, 1.0);

        // Camera Setup
        let time = uniforms.time * 0.05; 
        let camDist = 18.0; // Further out to see the jets
        let camH = camDist * 0.3; 
        let ro = vec3f(camDist * cos(time * 0.5), camH, camDist * sin(time * 0.5));
        let ta = vec3f(0.0, 0.0, 0.0);
        
        let w = normalize(ta - ro);
        let up = vec3f(0.0, 1.0, 0.0);
        let u = normalize(cross(w, up));
        let v = cross(u, w);
        
        var rd = normalize(p.x * u + p.y * v + 1.0 * w);
        var currPos = ro;

        // AGN Parameters
        let bhMass = 1.5; 
        let eventHorizon = 2.0 * bhMass; 
        let accretionInner = eventHorizon * 1.1;
        let accretionOuter = eventHorizon * 6.0; 
        let jetLength = 15.0;
        let jetWidth = 0.8;

        var col = vec3f(0.0);
        var glow = 0.0;
        
        let steps = 400;
        let stepSize = 0.15;
        
        for (var i = 0; i < steps; i++) {
            let r = length(currPos);
            
            // Event Horizon
            if (r < eventHorizon) {
                col = vec3f(0.0); 
                break;
            }

            // Gravitational Lensing (Stronger for AGN visual)
            let force = (bhMass * 4.0) / (r * r + 0.01); 
            rd = normalize(rd - normalize(currPos) * force * stepSize);

            // Relativistic Jets
            let distToAxis = length(currPos.xz);
            let distAlongAxis = abs(currPos.y);
            
            if (distAlongAxis < jetLength && distToAxis < jetWidth * (1.0 + distAlongAxis * 0.1)) {
                // Doppler beaming approximation
                let viewDotJet = dot(normalize(currPos), w);
                let beaming = 1.0 + 0.5 * viewDotJet; 
                
                let jetNoise = fbm(currPos * 2.0 - vec3f(0.0, time * 10.0, 0.0));
                let jetDensity = smoothstep(jetWidth, 0.0, distToAxis) * jetNoise * exp(-distAlongAxis * 0.1);
                
                let jetColor = vec3f(0.4, 0.6, 1.0) * 2.0; // Blue-ish jet
                col += jetColor * jetDensity * stepSize * beaming * 0.5;
            }

            // Accretion Disk (Broad/Narrow Lines)
            let distToPlane = abs(currPos.y);
            if (distToPlane < 0.8 && r > accretionInner && r < accretionOuter) {
                let angle = atan2(currPos.z, currPos.x);
                let rotAngle = angle + time * (6.0 / sqrt(r));
                
                let noiseVal = warp(vec3f(r * 2.0, rotAngle * 3.0, currPos.y * 4.0));
                
                // Ring structures
                let rings = 0.5 + 0.5 * sin(r * 10.0);
                
                let radialFade = smoothstep(accretionInner, accretionInner + 0.5, r) * 
                                 (1.0 - smoothstep(accretionOuter - 2.0, accretionOuter, r));
                let verticalFade = 1.0 - smoothstep(0.0, 0.4, distToPlane);
                
                let density = noiseVal * rings * radialFade * verticalFade;
                
                // AGN Palette (Brighter, more energetic)
                let temp = (accretionOuter - r) / (accretionOuter - accretionInner);
                let colorOuter = vec3f(0.8, 0.1, 0.1); // Redshift/Dusty
                let colorInner = vec3f(0.8, 0.9, 1.0); // Blue-hot
                let diskColor = mix(colorOuter, colorInner, pow(temp, 0.5)); 
                
                col += diskColor * density * stepSize * 3.0;
            }
            
            // Dusty Torus (Obscuring)
            if (r > accretionOuter && r < accretionOuter * 2.5 && abs(currPos.y) < r * 0.4) {
                 let torusNoise = fbm(currPos * 0.5);
                 let torusDensity = torusNoise * 0.1;
                 col = mix(col, vec3f(0.05, 0.02, 0.0), torusDensity * stepSize * 5.0);
            }

            glow += 0.01 / (r*r + 0.1);

            currPos += rd * stepSize;
            
            if (r > 30.0) {
                 let starVal = pow(noise(rd * 300.0), 20.0); 
                 col += vec3f(starVal);
                break;
            }
        }
        
        col += vec3f(0.2, 0.1, 0.3) * glow * 0.1;
        col = 1.0 - exp(-col * 1.5); // Tone mapping

        return vec4f(col, 1.0);
    }
`;

export const farAwayFrag = `
    // ---------------------------------------------------------
    // 3D Volumetric Raymarching (Cosmic Lighthouse)
    // ---------------------------------------------------------

    @fragment
    fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        let aspect = uniforms.resolution.x / uniforms.resolution.y;
        let p = (uv - 0.5) * 2.0 * vec2f(aspect, 1.0);

        // Camera Setup - Distant view
        let time = uniforms.time * 0.1; 
        let camDist = 80.0; // Further away
        let camH = camDist * 0.5; 
        let ro = vec3f(camDist * cos(time * 0.15), camH, camDist * sin(time * 0.15));
        let ta = vec3f(0.0, 0.0, 0.0);
        
        let w = normalize(ta - ro);
        let up = vec3f(0.0, 1.0, 0.0);
        let u = normalize(cross(w, up));
        let v = cross(u, w);
        
        var rd = normalize(p.x * u + p.y * v + 1.8 * w); 
        var currPos = ro;

        var col = vec3f(0.0);
        var transmittance = 1.0;
        
        let steps = 250;
        let stepSize = 2.0; // Larger steps for larger distance
        
        // Rotation matrix for tilt (around Z axis)
        let tiltAngle = 0.5;
        let c = cos(tiltAngle);
        let s = sin(tiltAngle);
        let tiltMat = mat3x3f(
            c, -s, 0.0,
            s, c, 0.0,
            0.0, 0.0, 1.0
        );
        
        // Volumetric Loop
        for (var i = 0; i < steps; i++) {
            // Apply tilt to the coordinate system
            let p = tiltMat * currPos;
            let r = length(p);
            
            // 1. Central Core (Star-like)
            let coreDist = r;
            let coreDensity = 1.0 / (coreDist * coreDist * 2.0 + 0.1);
            col += vec3f(1.0, 0.95, 0.8) * coreDensity * stepSize * 0.8;

            // 2. Relativistic Jets (Volumetric Beam)
            let distToAxis = length(p.xz);
            let distAlongAxis = abs(p.y);
            
            if (distAlongAxis < 50.0 && distToAxis < 4.0) {
                // Turbulence
                let flow = vec3f(0.0, time * 15.0, 0.0);
                let noiseVal = fbm(p * 0.5 - flow);
                
                // Beam shape
                let beamWidth = 0.5 + distAlongAxis * 0.02;
                var beamDensity = smoothstep(beamWidth * 4.0, 0.0, distToAxis);
                
                // Structure
                beamDensity *= (0.5 + 0.5 * noiseVal);
                
                // Falloff
                beamDensity *= exp(-distAlongAxis * 0.05);
                
                // Color (Electric Blue/Cyan)
                let jetColor = vec3f(0.2, 0.6, 1.0) + vec3f(0.5) * noiseVal;
                
                // Additive blending for "glowing" gas
                col += jetColor * beamDensity * stepSize * 0.15;
            }

            // 3. Accretion Disk / Galaxy (Nebula Cloud)
            let distToPlane = abs(p.y);
            if (distToPlane < 15.0 && r < 45.0) {
                // Spiral / Swirl - Faster spin
                let angle = atan2(p.z, p.x);
                let spiral = angle + r * 0.3 + time * 2.0; // Faster rotation
                
                // Turbulent coordinates
                let turb = vec3f(sin(spiral * 3.0), p.y * 0.5, cos(spiral * 3.0));
                let cloudNoise = fbm(p * 0.2 + turb + vec3f(0.0, time, 0.0));
                
                let diskDensity = smoothstep(15.0, 0.0, distToPlane) * 
                                  smoothstep(45.0, 5.0, r) * 
                                  cloudNoise;
                                  
                // Color (Red/Orange/Purple Nebula)
                let nebulaColor = mix(vec3f(0.8, 0.2, 0.1), vec3f(0.3, 0.0, 0.4), r / 40.0);
                
                // Brighter, more visible
                col += nebulaColor * diskDensity * stepSize * 0.1;
            }

            currPos += rd * stepSize;
            
            // Early exit if background (must be > camDist)
            if (r > 200.0) {
                 // Stars - Way dimmer
                 let starVal = pow(noise(rd * 400.0), 40.0); // Sharper points
                 col += vec3f(starVal * 0.3); // Dimmer
                break;
            }
        }
        
        // Tone mapping & Contrast
        col = pow(col, vec3f(1.2)); // Contrast
        col = 1.0 - exp(-col * 1.5); // Tone mapping

        return vec4f(col, 1.0);
    }
`;
