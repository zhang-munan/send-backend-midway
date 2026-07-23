pipeline {
    agent any

    environment {
        PATH        = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
        IMAGE_NAME  = 'ghcr.io/zhang-munan/send-backend-midway'
        IMAGE_TAG   = "v${BUILD_NUMBER}"
        SERVER_IP   = '124.222.204.121'
        SERVER_USER = 'deploy'
        DEPLOY_DIR  = '/opt/apps/bangni-shuochukou'
    }

    stages {
        stage('Checkout') {
            steps {
                git credentialsId: 'ghcr-credentials',
                    url: 'https://github.com/zhang-munan/send-backend-midway.git',
                    branch: 'release/0.x'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f Dockerfile.production ."
                sh "docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:latest"
            }
        }

        stage('Push to GHCR') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'ghcr-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh '''
                        echo "${DOCKER_PASS}" | docker login ghcr.io -u ${DOCKER_USER} --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker push ${IMAGE_NAME}:latest
                        docker logout ghcr.io
                    '''
                }
            }
        }

        stage('Deploy to Server') {
            steps {
                sshagent(credentials: ['server-ssh']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} '
                            cd ${DEPLOY_DIR} &&
                            sed -i "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${IMAGE_NAME}:${IMAGE_TAG}|" .env.production &&
                            docker compose --env-file .env.production -f compose.yml pull bangni-backend &&
                            docker compose --env-file .env.production -f compose.yml up -d bangni-backend
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
