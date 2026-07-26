pipeline {
    agent any

    environment {
        PATH        = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
        IMAGE_NAME  = 'bangni-backend'
        IMAGE_TAG   = "v${BUILD_NUMBER}"
        SERVER_IP   = '124.222.204.121'
        SERVER_USER = 'deploy'
        DEPLOY_DIR  = '/opt/apps/bangni-shuochukou'
        BUILD_DIR   = '/opt/apps/bangni-shuochukou/build'
    }

    stages {
        stage('Checkout') {
            steps {
                git credentialsId: 'ghcr-credentials',
                    url: 'https://github.com/zhang-munan/send-backend-midway.git',
                    branch: 'release/0.x'
            }
        }

        stage('Sync to Server') {
            steps {
                sshagent(credentials: ['server-ssh']) {
                    // 在服务器上创建构建目录
                    sh """
                        ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} 'mkdir -p ${BUILD_DIR}'
                    """
                    // 用 rsync 把代码同步到服务器（排除不需要的文件）
                    sh """
                        rsync -az --delete \
                            --exclude='.git' \
                            --exclude='node_modules' \
                            --exclude='dist' \
                            -e 'ssh -o StrictHostKeyChecking=no' \
                            ./ ${SERVER_USER}@${SERVER_IP}:${BUILD_DIR}/
                    """
                }
            }
        }

        stage('Build & Deploy on Server') {
            steps {
                sshagent(credentials: ['server-ssh']) {
                    // 在服务器上直接构建（amd64 原生，无需交叉编译）并部署
                    sh """
                        ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} '
                            cd ${BUILD_DIR} &&
                            docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f Dockerfile.production . &&
                            cd ${DEPLOY_DIR} &&
                            sed -i "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${IMAGE_NAME}:${IMAGE_TAG}|" .env.production &&
                            docker compose --env-file .env.production -f compose.yml up -d bangni-backend &&
                            echo "✅ 构建部署完成: ${IMAGE_NAME}:${IMAGE_TAG}"
                        '
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ 部署成功！镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
        }
        failure {
            echo "❌ 部署失败，请检查日志"
        }
    }
}
