package com.fishpet.pet;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Learning Assistant Runtime 启动类。
 *
 * <p>模块边界见 docs/architecture.md 第 3 节：common / user / learning / plugin / ai /
 * knowledge / event / agent。模块之间只允许单向依赖，跨模块访问必须走对方 Service 接口。
 */
@SpringBootApplication
@MapperScan("com.fishpet.pet.**.mapper")
public class PetApplication {

    public static void main(String[] args) {
        SpringApplication.run(PetApplication.class, args);
    }
}
