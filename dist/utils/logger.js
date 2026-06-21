function emit(level, message, meta) {
    const payload = {
        level,
        time: new Date().toISOString(),
        message,
        ...meta,
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
        console.error(line);
    }
    else if (level === "warn") {
        console.warn(line);
    }
    else {
        console.log(line);
    }
}
export const logger = {
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
};
//# sourceMappingURL=logger.js.map