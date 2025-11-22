
async function init() {
    if (!navigator.gpu) {
        console.error("WebGPU not supported");
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("No WebGPU adapter found");
        return;
    }

    const device = await adapter.requestDevice();
    const canvas = document.getElementById("bg-canvas");
    const context = canvas.getContext("webgpu");

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: format,
        alphaMode: "premultiplied",
    });

    // ---------------------------------------------------------
    // Shader Codes
    // ---------------------------------------------------------

    const { commonCode, blackHoleFrag, agnFrag, farAwayFrag } = await import('./shaders.js');

    // ---------------------------------------------------------
    // Pipeline Creation
    // ---------------------------------------------------------

    let currentPipeline;
    let currentBindGroup;
    let uniformBuffer;

    function createPipeline(fragmentCode) {
        const shaderModule = device.createShaderModule({
            code: commonCode + fragmentCode
        });

        const pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format: format }],
            },
            primitive: {
                topology: "triangle-list",
            },
        });

        return pipeline;
    }

    // ---------------------------------------------------------
    // Setup & Loop
    // ---------------------------------------------------------

    const uniformBufferSize = 16;
    uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Initialize Pipelines
    let pipelineBH = createPipeline(blackHoleFrag);
    let pipelineAGN = createPipeline(agnFrag);
    let pipelineFar = createPipeline(farAwayFrag);

    // State Management
    const MODES = {
        BLACK_HOLE: 0,
        AGN: 1,
        FAR_AWAY: 2
    };
    let currentMode = MODES.BLACK_HOLE;

    currentPipeline = pipelineBH;

    function updateBindGroup() {
        currentBindGroup = device.createBindGroup({
            layout: currentPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
            ],
        });
    }
    updateBindGroup();

    // Toggle Functionality
    const toggleBtn = document.getElementById("shader-toggle");

    function updateButtonText() {
        if (!toggleBtn) return;
        switch (currentMode) {
            case MODES.BLACK_HOLE:
                toggleBtn.innerText = "Switch to AGN";
                break;
            case MODES.AGN:
                toggleBtn.innerText = "Switch to Far Away";
                break;
            case MODES.FAR_AWAY:
                toggleBtn.innerText = "Switch to Black Hole";
                break;
        }
    }

    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            currentMode = (currentMode + 1) % 3;

            switch (currentMode) {
                case MODES.BLACK_HOLE:
                    currentPipeline = pipelineBH;
                    break;
                case MODES.AGN:
                    currentPipeline = pipelineAGN;
                    break;
                case MODES.FAR_AWAY:
                    currentPipeline = pipelineFar;
                    break;
            }

            updateBindGroup();
            updateButtonText();
        });
        // Set initial text
        updateButtonText();
    }

    function frame(time) {
        const t = time * 0.001;
        const resolution = new Float32Array([canvas.width, canvas.height]);

        const uniformData = new Float32Array([t, 0, resolution[0], resolution[1]]);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();

        const renderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store",
            }],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(currentPipeline);
        passEncoder.setBindGroup(0, currentBindGroup);
        passEncoder.draw(6);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }

    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
    });
    observer.observe(canvas);

    requestAnimationFrame(frame);
}

init();
